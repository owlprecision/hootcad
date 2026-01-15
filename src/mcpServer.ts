/**
 * MCP Server for HootCAD - Safe Math Evaluation
 * 
 * This server exposes safe, deterministic math evaluation capabilities
 * for agent validation loops. It does NOT execute arbitrary code or
 * perform CAD operations directly.
 * 
 * Security Model:
 * - No arbitrary code execution (no eval, no Function constructor)
 * - No filesystem, environment, or VS Code API access
 * - No network access
 * - All inputs treated as untrusted
 * - Uses mathjs with locked-down configuration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	McpError,
	ErrorCode
} from '@modelcontextprotocol/sdk/types.js';

// Use require for mathjs to work around ESM/CommonJS interop issues in the bundled output.
// Webpack will bundle mathjs correctly when using require(), while using ES6 import causes
// TypeScript compilation errors due to module resolution conflicts. This is a safe pattern
// since webpack transforms the require() into bundled code, not a runtime dependency.
const mathjs = require('mathjs');

type MathJsInstance = ReturnType<typeof mathjs.create>;

/**
 * Maximum expression length to prevent DoS attacks
 */
const MAX_EXPRESSION_LENGTH = 1000;

/**
 * Maximum number of variables to prevent DoS attacks
 */
const MAX_VARIABLES = 100;

/**
 * Regex for valid variable names (simple identifiers only)
 */
const VALID_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Create a hardened mathjs instance with dangerous features disabled.
 * 
 * This follows mathjs's "more secure eval" pattern by:
 * 1. Creating an isolated instance
 * 2. Capturing the original evaluate function
 * 3. Explicitly disabling high-risk APIs via import override
 * 
 * The result is an evaluator limited to pure numeric math with no
 * ability to execute code, import modules, or access external state.
 */
function createSecureMathEvaluator(): (expr: string, scope?: Record<string, number>) => number {
	const math: MathJsInstance = mathjs.create(mathjs.all);
	
	// Capture the original evaluator before disabling it
	const limitedEvaluate = math.evaluate;
	
	// Disable dangerous or unnecessary APIs by overriding them
	// This prevents any dynamic code execution, imports, or mutations
	math.import({
		import: () => { throw new Error('Function import is disabled'); },
		createUnit: () => { throw new Error('Function createUnit is disabled'); },
		evaluate: () => { throw new Error('Function evaluate is disabled'); },
		parse: () => { throw new Error('Function parse is disabled'); },
		simplify: () => { throw new Error('Function simplify is disabled'); },
		derivative: () => { throw new Error('Function derivative is disabled'); }
	}, { override: true });
	
	/**
	 * Safe evaluation wrapper that validates inputs and outputs
	 */
	return (expr: string, scope?: Record<string, number>): number => {
		// Validate expression length
		if (expr.length > MAX_EXPRESSION_LENGTH) {
			throw new Error(`Expression too long (max ${MAX_EXPRESSION_LENGTH} characters)`);
		}
		
		// Validate scope if provided
		if (scope) {
			const varCount = Object.keys(scope).length;
			if (varCount > MAX_VARIABLES) {
				throw new Error(`Too many variables (max ${MAX_VARIABLES})`);
			}
			
			// Validate variable names and values
			for (const [name, value] of Object.entries(scope)) {
				if (!VALID_VAR_NAME.test(name)) {
					throw new Error(`Invalid variable name: ${name}`);
				}
				if (typeof value !== 'number') {
					throw new Error(`Variable ${name} must be a number`);
				}
				if (!Number.isFinite(value)) {
					throw new Error(`Variable ${name} must be a finite number`);
				}
			}
		}
		
		// Evaluate the expression. mathjs treats a provided-but-undefined scope
		// differently than an omitted scope, so only pass it when present.
		const result = scope ? limitedEvaluate(expr, scope) : limitedEvaluate(expr);
		
		// Validate result is a finite number
		if (typeof result !== 'number') {
			throw new Error('Expression must evaluate to a number');
		}
		if (!Number.isFinite(result)) {
			throw new Error('Expression must evaluate to a finite number');
		}
		
		return result;
	};
}

/**
 * Initialize and start the MCP server
 */
async function main(): Promise<void> {
	// Create the secure math evaluator
	const secureEval = createSecureMathEvaluator();
	
	// Create MCP server
	const server = new Server(
		{
			name: 'hootcad-mcp',
			version: '0.1.0'
		},
		{
			capabilities: {
				tools: {}
			}
		}
	);
	
	// Register tool: math.eval
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: [
				{
					name: 'math.eval',
					description: [
						'CAD helper: validate derived numeric values before finalizing geometry.',
						'Use this for computations that affect geometry: distances, offsets, clearances, bounding extents, angles/camber (degrees↔radians), trig, sqrt, pi, chained transforms, pattern spacing, unit conversions.',
						'Workflow: put the exact expression you plan to use in code into expr, pass named variables in vars, then use the returned numeric value. Avoid mental math for final dimensions.',
						'Safe/deterministic: pure numeric math only (no code execution, no side effects).'
					].join(' '),
					inputSchema: {
						type: 'object',
						required: ['expr'],
						properties: {
							expr: {
								type: 'string',
								description: 'Pure numeric expression to evaluate. Prefer radians for angles. Example: "sqrt((x2-x1)^2 + (y2-y1)^2)" or "wheelbase/2 + tireRadius + clearance".'
							},
							vars: {
								type: 'object',
								additionalProperties: {
									type: 'number'
								},
								description: 'Optional named numeric variables (CAD parameters, intermediate values). Example: {"wheelbase":120,"tireRadius":18,"clearance":2}.'
							}
						}
					}
				},
				{
					name: 'cad.eval',
					description: [
						'Alias of math.eval (same behavior), named for CAD workflows.',
						'Use when computing derived dimensions or transforms (especially camber/angles and degree↔radian conversions).'
					].join(' '),
					inputSchema: {
						type: 'object',
						required: ['expr'],
						properties: {
							expr: {
								type: 'string',
								description: 'Pure numeric expression to evaluate. Prefer radians for angles.'
							},
							vars: {
								type: 'object',
								additionalProperties: {
									type: 'number'
								},
								description: 'Optional named numeric variables.'
							}
						}
					}
				}
			]
		};
	});
	
	// Handle tool calls
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		if (request.params.name !== 'math.eval' && request.params.name !== 'cad.eval') {
			throw new McpError(
				ErrorCode.MethodNotFound,
				`Unknown tool: ${request.params.name}`
			);
		}
		
		const args = request.params.arguments as {
			expr?: unknown;
			vars?: unknown;
		};
		
		// Validate required argument
		if (typeof args.expr !== 'string') {
			throw new McpError(
				ErrorCode.InvalidParams,
				'expr must be a string'
			);
		}
		
		// Validate optional vars argument
		let vars: Record<string, number> | undefined;
		if (args.vars !== undefined) {
			if (typeof args.vars !== 'object' || args.vars === null || Array.isArray(args.vars)) {
				throw new McpError(
					ErrorCode.InvalidParams,
					'vars must be an object'
				);
			}
			vars = args.vars as Record<string, number>;
		}
		
		try {
			// Log tool invocation to stderr so it shows up in the extension OutputChannel.
			// Keep it minimal: no full expression contents.
			const exprLen = args.expr.length;
			const varCount = vars ? Object.keys(vars).length : 0;
			console.error(`math.eval called (exprLen=${exprLen}, varCount=${varCount})`);

			// Evaluate the expression
			const value = secureEval(args.expr, vars);
			
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({ value, expr: args.expr, vars })
					}
				]
			};
		} catch (error) {
			// Return evaluation errors as tool errors, not MCP errors
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new McpError(
				ErrorCode.InternalError,
				`Math evaluation failed: ${errorMessage}`
			);
		}
	});
	
	// Start server with stdio transport
	const transport = new StdioServerTransport();
	await server.connect(transport);
	
	// Log startup (to stderr so it doesn't interfere with stdio protocol)
	console.error('HootCAD MCP server started');
}

// Start the server
main().catch((error) => {
	console.error('Fatal error starting MCP server:', error);
	process.exit(1);
});
