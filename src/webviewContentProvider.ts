import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Provides HTML content for the webview preview panel
 * Handles template generation and resource URI management
 */
export class WebviewContentProvider {
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	/**
	 * Generate complete HTML content for the webview
	 */
	getWebviewContent(webview: vscode.Webview): string {
		const rendererUri = this.getRendererUri(webview);
		const stylesUri = this.getPreviewCssUri(webview);

		const nonce = this.generateNonce();

		const template = this.readRendererHtmlTemplate();
		return this.applyTemplate(template, {
			'{{cspSource}}': webview.cspSource,
			'{{nonce}}': nonce,
			'{{rendererUri}}': rendererUri.toString(),
			'{{stylesUri}}': stylesUri.toString()
		});
	}

	/**
	 * Get the webview URI for renderer entry module
	 */
	private getRendererUri(webview: vscode.Webview): vscode.Uri {
		const rendererPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'dist',
			'webview',
			'renderer.js'
		);
		return webview.asWebviewUri(rendererPath);
	}

	/**
	 * Get the webview URI for preview stylesheet
	 */
	private getPreviewCssUri(webview: vscode.Webview): vscode.Uri {
		const cssPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'dist',
			'webview',
			'preview.css'
		);
		return webview.asWebviewUri(cssPath);
	}

	/**
	 * Read renderer HTML template from file
	 */
	private readRendererHtmlTemplate(): string {
		const templatePath = path.join(
			this.context.extensionPath,
			'dist',
			'webview',
			'renderer.html'
		);
		try {
			return fs.readFileSync(templatePath, 'utf8');
		} catch (error) {
			console.error('Failed to read renderer HTML template:', templatePath, error);
			return '';
		}
	}

	private generateNonce(): string {
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let text = '';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	private applyTemplate(template: string, replacements: Record<string, string>): string {
		let out = template;
		for (const [key, value] of Object.entries(replacements)) {
			out = out.split(key).join(value);
		}
		return out;
	}
}

