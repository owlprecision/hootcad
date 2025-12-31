/**
 * Utility functions for file path handling and formatting
 */

/**
 * Extracts the filename from a file path, handling both Unix and Windows path separators.
 * @param filePath The full file path
 * @returns The filename, or 'preview' as fallback
 */
export function extractFilename(filePath: string): string {
	return filePath.split(/[/\\]/).pop() || 'preview';
}

/**
 * Formats a preview window title with the owl emoji and filename.
 * @param filePath The full file path
 * @returns The formatted title (e.g., "🦉 filename.jscad")
 */
export function formatPreviewTitle(filePath: string): string {
	const fileName = extractFilename(filePath);
	return `🦉 ${fileName}`;
}
