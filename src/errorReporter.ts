import * as vscode from 'vscode';

/**
 * Centralized error reporting and logging service
 * Handles error formatting, logging, and user notifications
 */
export class ErrorReporter {
	private outputChannel: vscode.OutputChannel;

	constructor(outputChannel: vscode.OutputChannel) {
		this.outputChannel = outputChannel;
	}

	/**
	 * Get the output channel for direct access when needed
	 */
	getOutputChannel(): vscode.OutputChannel {
		return this.outputChannel;
	}

	/**
	 * Log an info message to the output channel
	 */
	logInfo(message: string): void {
		this.outputChannel.appendLine(message);
	}

	/**
	 * Log an error and show user notification
	 */
	reportError(error: unknown, context: string, filePath?: string): void {
		const errorMsg = this.getErrorMessage(error);
		this.outputChannel.appendLine(`${context}: ${errorMsg}`);

		// Report source location from stack trace if available
		const stack = this.getErrorStack(error);
		if (stack && filePath) {
			const location = this.extractSourceLocation(stack, filePath);
			if (location) {
				this.outputChannel.appendLine(`Source location: ${location}`);
			}
		}

		vscode.window.showErrorMessage(`${context}: ${errorMsg} (see Output → HootCAD for details)`);
	}

	/**
	 * Log execution error with parameter snapshot
	 */
	reportExecutionError(error: unknown, filePath: string, params?: Record<string, any>): void {
		const errorMsg = this.getErrorMessage(error);
		this.outputChannel.appendLine(`Execution failed: ${errorMsg}`);

		// Best-effort parameter snapshot to help users troubleshoot
		if (params) {
			this.logParameterSnapshot(params);
		}

		// Source location reporting from stack trace
		const stack = this.getErrorStack(error);
		if (stack) {
			const location = this.extractSourceLocation(stack, filePath);
			if (location) {
				this.outputChannel.appendLine(`Source location: ${location}`);
			}
		}

		vscode.window.showErrorMessage(`JSCAD execution failed: ${errorMsg} (see Output → HootCAD for details)`);
	}

	/**
	 * Extract error message from unknown error type
	 */
	getErrorMessage(error: unknown): string {
		if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
			return (error as any).message;
		}
		return String(error);
	}

	/**
	 * Extract stack trace from error if available
	 */
	getErrorStack(error: unknown): string | undefined {
		if (error && typeof error === 'object' && 'stack' in error && typeof (error as any).stack === 'string') {
			return (error as any).stack;
		}
		return undefined;
	}

	/**
	 * Extract source location from stack trace
	 */
	private extractSourceLocation(stack: string, filePath: string): string | null {
		const escaped = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const match = stack.match(new RegExp(`${escaped}:(\\d+):(\\d+)`));
		if (match) {
			return `${filePath}:${match[1]}:${match[2]}`;
		}
		return null;
	}

	/**
	 * Log parameter snapshot for debugging
	 */
	private logParameterSnapshot(params: Record<string, any>): void {
		try {
			const snapshot = JSON.stringify(params, Object.keys(params).sort(), 2);
			const maxLen = 10_000;
			this.outputChannel.appendLine('Parameter snapshot:');
			this.outputChannel.appendLine(snapshot.length > maxLen ? snapshot.slice(0, maxLen) + '\n… (truncated)' : snapshot);
		} catch (e) {
			this.outputChannel.appendLine('Parameter snapshot: <unavailable>');
		}
	}
}
