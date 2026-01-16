/**
 * MCP Server for HootCAD - Safe Math Evaluation and CAD Advice
 * 
 * This server exposes safe, deterministic math evaluation capabilities
 * and CAD design advice for agent validation loops. It does NOT execute 
 * arbitrary code or perform CAD operations directly.
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
import * as fs from 'fs';
import * as path from 'path';
import { MCP_SERVER_VERSION } from './mcpVersion';

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
 * Load CAD advice from markdown files
 * 
 * Reads advice content from the advice directory. Categories are defined
 * by markdown filenames (e.g., general.md, dfm.md, jscad-specific.md).
 * 
 * @param category Optional category name. If not provided, returns general advice.
 * @returns The complete markdown content as a string
 */
function loadCadAdvice(category?: string): string {
	// Default to general advice if no category specified
	const categoryName = category || 'general';
	
	// Validate category name to prevent path traversal attacks
	// Only allow lowercase letters, numbers, and hyphens
	const validCategoryPattern = /^[a-z0-9-]+$/;
	if (!validCategoryPattern.test(categoryName)) {
		throw new Error(`Invalid category name: ${categoryName}. Category names must contain only lowercase letters, numbers, and hyphens.`);
	}
	
	// Construct path to advice file
	// When bundled, advice files are in the same directory as mcpServer.js
	const adviceDir = path.join(__dirname, 'advice');
	const adviceFile = path.join(adviceDir, `${categoryName}.md`);
	
	// Check if file exists
	if (!fs.existsSync(adviceFile)) {
		const availableCategories = getAvailableCategories();
		throw new Error(`Unknown advice category: ${categoryName}. Available categories: ${availableCategories.join(', ')}`);
	}
	
	// Read and return the markdown content as-is to preserve formatting
	const content = fs.readFileSync(adviceFile, 'utf-8');
	return content;
}

/**
 * Get list of available advice categories
 */
function getAvailableCategories(): string[] {
	const adviceDir = path.join(__dirname, 'advice');
	
	// If directory doesn't exist, return empty array
	if (!fs.existsSync(adviceDir)) {
		return [];
	}
	
	// Read all .md files in the advice directory
	const files = fs.readdirSync(adviceDir);
	return files
		.filter(file => file.endsWith('.md'))
		.map(file => file.replace('.md', ''))
		.sort();
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
			version: MCP_SERVER_VERSION
		},
		{
			capabilities: {
				tools: {}
			}
		}
	);
	
	// Register tools
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: [
				{
					name: 'cad_advice',
					description: [
						'CRITICAL: Call this tool FIRST before starting ANY CAD-related work (writing JSCAD code, designing 3D models, or planning geometry).',
						'This tool provides essential guidance for CAD design, JSCAD programming, and manufacturability.',
						'Returns expert advice as an array of text lines covering best practices, common patterns, and critical considerations.',
						'Always review the advice before writing code to avoid common mistakes and ensure design quality.'
					].join(' '),
					inputSchema: {
						type: 'object',
						properties: {
							category: {
								type: 'string',
								description: [
									'Optional advice category. Available categories:',
									'- "general" (default): Core CAD advice, spatial reasoning, JSCAD primitives, and cad_math usage',
									'- "dfm": Design for Manufacturing - 3D printing constraints, tolerances, clearances',
									'- "jscad-specific": JSCAD syntax, module system, transforms, common gotchas',
									'Omit this parameter to get general advice which includes the list of all available categories.',
									'Category names must be lowercase alphanumeric with hyphens only.'
								].join(' ')
							}
						}
					}
				},
				{
					name: 'cad_math',
					description: [
						'CAD helper: validate derived numeric values before finalizing geometry or transforms.',
						'Use this for spatial reasoning: distances, offsets, alignments, clearances, bounding extents, angles/camber (degrees↔radians), trig, sqrt, pi, chained transforms, pattern spacing, unit conversions.',
						'REQUIRED WORKFLOW for assemblies: for every part-to-part connection, compute the intended contact/overlap numerically (gap≈0 or overlap>0) and ONLY THEN choose translate/rotate values.',
						'Examples: gap = (socketCenter - pegCenter) - (socketRadius - pegRadius); want gap<=0.1. Or: contact = (baseTopZ) - (domeBottomZ); want contact≈0.',
						'Put the exact expression you plan to use in code into expr, pass named variables in vars, then use the returned numeric value. Avoid mental math for final dimensions.',
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
				}
			]
		};
	});
	
	// Handle tool calls
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		// Handle CAD advice tool
		if (request.params.name === 'cad_advice') {
			const args = request.params.arguments as {
				category?: unknown;
			};
			
			// Validate optional category argument
			let category: string | undefined;
			if (args.category !== undefined) {
				if (typeof args.category !== 'string') {
					throw new McpError(
						ErrorCode.InvalidParams,
						'category must be a string'
					);
				}
				category = args.category;
			}
			
			try {
				// Log tool invocation
				console.error(`cad_advice called (category=${category || 'general'})`);
				
				// Load the advice
				const adviceContent = loadCadAdvice(category);
				const categories = getAvailableCategories();
				
				// Return advice as markdown text with metadata in JSON format
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								category: category || 'general',
								availableCategories: categories,
								content: adviceContent
							}, null, 2)
						}
					]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				throw new McpError(
					ErrorCode.InternalError,
					`Failed to load CAD advice: ${errorMessage}`
				);
			}
		}
		
		// Handle CAD math tool
		if (request.params.name !== 'cad_math') {
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
			console.error(`cad_math called (exprLen=${exprLen}, varCount=${varCount})`);

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
