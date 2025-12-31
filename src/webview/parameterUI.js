/**
 * Parameter UI module for webview
 * Handles rendering and updating parameter controls
 */

/**
 * Updates the parameter UI with the given parameter definitions and values
 * @param {Object} parameters - Object containing definitions, values, and filePath
 * @param {HTMLElement} parameterPanel - The panel element
 * @param {HTMLElement} parameterContent - The content container
 * @param {Object} vscode - VS Code API object
 */
export function updateParameterUI(parameters, parameterPanel, parameterContent, vscode) {
	if (!parameters || !parameters.definitions || parameters.definitions.length === 0) {
		parameterPanel.classList.remove('visible');
		return;
	}
	
	parameterPanel.classList.add('visible');
	parameterContent.innerHTML = '';
	
	for (const def of parameters.definitions) {
		const item = document.createElement('div');
		item.className = 'parameter-item';
		
		const label = document.createElement('label');
		label.className = 'parameter-label';
		label.textContent = def.caption || def.name;
		item.appendChild(label);
		
		const currentValue = parameters.values[def.name] !== undefined 
			? parameters.values[def.name] 
			: def.initial;
		
		if (def.type === 'checkbox') {
			createCheckboxInput(item, def, currentValue, parameters.filePath, vscode);
		} else if (def.type === 'slider' || (def.type === 'number' && def.min !== undefined && def.max !== undefined)) {
			createSliderInput(item, def, currentValue, parameters.filePath, vscode);
		} else {
			createTextInput(item, def, currentValue, parameters.filePath, vscode);
		}
		
		parameterContent.appendChild(item);
	}
}

/**
 * Creates a checkbox input for a parameter
 */
function createCheckboxInput(item, def, currentValue, filePath, vscode) {
	const checkboxLabel = document.createElement('label');
	checkboxLabel.className = 'parameter-checkbox-label';
	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.className = 'parameter-input parameter-checkbox';
	checkbox.checked = currentValue;
	checkbox.addEventListener('change', () => {
		vscode.postMessage({
			type: 'parameterChanged',
			filePath: filePath,
			name: def.name,
			value: checkbox.checked
		});
	});
	checkboxLabel.appendChild(checkbox);
	checkboxLabel.appendChild(document.createTextNode(' ' + (def.caption || def.name)));
	item.innerHTML = '';
	item.appendChild(checkboxLabel);
}

/**
 * Creates a slider input for a parameter
 */
function createSliderInput(item, def, currentValue, filePath, vscode) {
	const slider = document.createElement('input');
	slider.type = 'range';
	slider.className = 'parameter-input parameter-slider';
	slider.min = def.min || 0;
	slider.max = def.max || 100;
	slider.step = def.step || 1;
	slider.value = currentValue;
	
	const valueDisplay = document.createElement('div');
	valueDisplay.className = 'parameter-value';
	valueDisplay.textContent = currentValue;
	
	slider.addEventListener('input', () => {
		valueDisplay.textContent = slider.value;
		vscode.postMessage({
			type: 'parameterChanged',
			filePath: filePath,
			name: def.name,
			value: parseFloat(slider.value)
		});
	});
	
	item.appendChild(slider);
	item.appendChild(valueDisplay);
}

/**
 * Creates a text input for a parameter
 */
function createTextInput(item, def, currentValue, filePath, vscode) {
	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'parameter-input';
	input.value = currentValue;
	input.addEventListener('change', () => {
		let value = input.value;
		if (def.type === 'number' || def.type === 'int' || def.type === 'float') {
			value = parseFloat(value);
		}
		vscode.postMessage({
			type: 'parameterChanged',
			filePath: filePath,
			name: def.name,
			value
		});
	});
	item.appendChild(input);
}
