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
		const threeUri = this.getThreeJsUri(webview);
		const converterUri = this.getConverterUri(webview);
		const parameterUIUri = this.getParameterUIUri(webview);
		const rendererUri = this.getRendererUri(webview);
		const stylesUri = this.getPreviewCssUri(webview);

		const nonce = this.generateNonce();
		const config = {
			threeUri: threeUri.toString(),
			converterUri: converterUri.toString(),
			parameterUIUri: parameterUIUri.toString()
		};
		const encodedConfig = encodeURIComponent(JSON.stringify(config));

		const template = this.readRendererHtmlTemplate();
		return this.applyTemplate(template, {
			'{{cspSource}}': webview.cspSource,
			'{{nonce}}': nonce,
			'{{rendererUri}}': rendererUri.toString(),
			'{{stylesUri}}': stylesUri.toString(),
			'{{config}}': encodedConfig
		});
	}

	/**
	 * Get the webview URI for Three.js module
	 */
	private getThreeJsUri(webview: vscode.Webview): vscode.Uri {
		const threePath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'node_modules',
			'three',
			'build',
			'three.module.js'
		);
		return webview.asWebviewUri(threePath);
	}

	/**
	 * Get the webview URI for converter module
	 */
	private getConverterUri(webview: vscode.Webview): vscode.Uri {
		const converterPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'src',
			'webview',
			'converter.js'
		);
		return webview.asWebviewUri(converterPath);
	}

	/**
	 * Get the webview URI for parameter UI module
	 */
	private getParameterUIUri(webview: vscode.Webview): vscode.Uri {
		const parameterUIPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'src',
			'webview',
			'parameterUI.js'
		);
		return webview.asWebviewUri(parameterUIPath);
	}

	/**
	 * Get the webview URI for renderer entry module
	 */
	private getRendererUri(webview: vscode.Webview): vscode.Uri {
		const rendererPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'src',
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
			'src',
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
			'src',
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

