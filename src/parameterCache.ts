import * as vscode from 'vscode';
import { ParameterDefinition } from './jscadEngine';

/**
 * Manages parameter value cache for JSCAD files
 * Stores user-edited parameter values per file path
 */
export class ParameterCache {
    private cache: Map<string, Record<string, any>> = new Map();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadFromStorage();
    }

    /**
     * Get cached parameter values for a file
     */
    get(filePath: string): Record<string, any> | undefined {
        return this.cache.get(filePath);
    }

    /**
     * Set parameter values for a file
     */
    set(filePath: string, values: Record<string, any>): void {
        this.cache.set(filePath, values);
        this.saveToStorage();
    }

    /**
     * Update a single parameter value for a file
     */
    updateParameter(filePath: string, paramName: string, value: any): void {
        const current = this.cache.get(filePath) || {};
        current[paramName] = value;
        this.cache.set(filePath, current);
        this.saveToStorage();
    }

    /**
     * Get merged parameters with defaults and cached values
     */
    getMergedParameters(filePath: string, definitions: ParameterDefinition[]): Record<string, any> {
        const cached = this.cache.get(filePath) || {};
        const merged: Record<string, any> = {};

        const coerceColor = (value: any): any => {
            // Accept arrays already in [r,g,b] or [r,g,b,a]
            if (Array.isArray(value)) {
                const numeric = value.map((v: any) => Number(v));
                if (numeric.every((v: number) => Number.isFinite(v)) && (numeric.length === 3 || numeric.length === 4)) {
                    const needsNormalize = numeric.some((v: number) => v > 1);
                    const normalized = needsNormalize ? numeric.map((v: number) => v / 255) : numeric;
                    const rgba = normalized.length === 3 ? [...normalized, 1] : normalized;
                    return rgba;
                }
                return value;
            }

            if (typeof value !== 'string') {
                return value;
            }

            const hex = value.trim();
            const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(hex);
            if (!match) {
                return value;
            }

            let digits = match[1];
            // Expand shorthand forms (#rgb, #rgba)
            if (digits.length === 3 || digits.length === 4) {
                digits = digits.split('').map(ch => ch + ch).join('');
            }

            const r = parseInt(digits.slice(0, 2), 16);
            const g = parseInt(digits.slice(2, 4), 16);
            const b = parseInt(digits.slice(4, 6), 16);
            const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) : 255;

            return [r / 255, g / 255, b / 255, a / 255];
        };

        const coerceValue = (def: ParameterDefinition, value: any): any => {
            if (value === undefined) {
                return value;
            }

            if (def.type === 'color') {
                return coerceColor(value);
            }

            if (def.type === 'checkbox') {
                if (typeof value === 'boolean') {
                    return value;
                }
                if (typeof value === 'string') {
                    return value.toLowerCase() === 'true';
                }
                return Boolean(value);
            }

            if (def.type === 'int') {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    return Math.trunc(value);
                }
                const parsed = typeof value === 'string' ? parseInt(value, 10) : Number(value);
                return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
            }

            if (def.type === 'number' || def.type === 'float' || def.type === 'slider') {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    return value;
                }
                const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
                return Number.isFinite(parsed) ? parsed : undefined;
            }

            if (def.type === 'choice' && Array.isArray(def.values)) {
                const match = def.values.find(v => String(v) === String(value));
                return match !== undefined ? match : value;
            }

            return value;
        };

        // Start with default values from definitions
        for (const def of definitions) {
            if (def.type === 'checkbox') {
                merged[def.name] = def.checked ?? false;
            } else if (def.type === 'choice' && def.initial !== undefined) {
                merged[def.name] = coerceValue(def, def.initial);
            } else if (def.type === 'choice' && def.values && def.values.length > 0) {
                // Use first value as default when no initial value specified
                merged[def.name] = coerceValue(def, def.values[0]);
            } else if (def.initial !== undefined) {
                merged[def.name] = coerceValue(def, def.initial);
            }
        }

        // Override with cached values (coerced to definition types)
        for (const def of definitions) {
            if (Object.prototype.hasOwnProperty.call(cached, def.name)) {
                const coerced = coerceValue(def, cached[def.name]);
                if (coerced !== undefined) {
                    merged[def.name] = coerced;
                }
            }
        }

        return merged;
    }

    /**
     * Clear cached values for a file
     */
    clear(filePath: string): void {
        this.cache.delete(filePath);
        this.saveToStorage();
    }

    /**
     * Clear all cached values
     */
    clearAll(): void {
        this.cache.clear();
        this.saveToStorage();
    }

    /**
     * Load cache from VS Code workspace state
     */
    private loadFromStorage(): void {
        const stored = this.context.workspaceState.get<Record<string, Record<string, any>>>('hootcad.parameterCache');
        if (stored) {
            this.cache = new Map(Object.entries(stored));
        }
    }

    /**
     * Save cache to VS Code workspace state
     */
    private saveToStorage(): void {
        const obj = Object.fromEntries(this.cache.entries());
        this.context.workspaceState.update('hootcad.parameterCache', obj);
    }
}
