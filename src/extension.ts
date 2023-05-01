import * as vscode from "vscode";

const config = vscode.workspace.getConfiguration("design-system-linter");
const selectedDesignSystem = config.get<string>("designSystem") || "default";

let isEnabled = true;
let statusBarItem: vscode.StatusBarItem;
let tokens: [string, number][];
let colorTokens: [string, string][];

/**
 * @description Loads the selected design system
 * @param {string} system The name of the design system to load
 * @returns {Promise<void>}
 */
async function loadDesignSystem(system: string): Promise<void> {
  try {
    switch (system) {
      case "default":
        const designSystem = await import("./design-systems/default.json");
        tokens = Object.entries(designSystem.default.spacing);
        colorTokens = Object.entries(designSystem.default.colors);
        break;
      case "custom":
        tokens = config.get<[string, number][]>("customSpacingTokens") || [];
        colorTokens = config.get<[string, string][]>("customColorTokens") || [];
        break;
      default:
        throw new Error(`Unsupported design system: ${system}`);
    }
  } catch (error: any) {
    throw new Error(error);
  }
}

/**
 * @description Activates the extension
 * @returns {void}
 */
function toggleTokens(): void {
  isEnabled = !isEnabled;
  statusBarItem.text = isEnabled ? "+Tokens" : "-Tokens";

  if (isEnabled) {
    if (vscode.window.activeTextEditor) {
      lintDocument(vscode.window.activeTextEditor.document);
    }
  } else {
    clearRecommendations();
  }
}

/**
 * @description Clears all recommendations
 * @returns {void}
 */
function clearRecommendations(): void {
  diagnosticCollection.clear();
  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor) {
    activeTextEditor.setDecorations(recommendationDecorationType, []);
  }
}

/**
 * @description Lints the given document for token recommendations
 * @param {number} value
 * @returns {string} The nearest token to the given value
 */
function findNearestSpacingToken(value: number): string {
  let minDiff = Number.MAX_VALUE;
  let nearestToken = "";

  for (const [token, tokenValue] of tokens) {
    if (typeof tokenValue === "number") {
      const diff = Math.abs(tokenValue - value);
      if (diff < minDiff) {
        minDiff = diff;
        nearestToken = token;
      }
    }
  }

  return nearestToken;
}

/**
 * @description Accepts a hex color string and returns a list of matching tokens
 * @param {string} hexColor
 * @returns {string[]} A list of matching tokens
 */
function findExactColorToken(hexColor: string): string[] {
  const matchingTokens: string[] = [];
  for (const [token, tokenColor] of colorTokens) {
    if (tokenColor.toLowerCase() === hexColor.toLowerCase()) {
      matchingTokens.push(token);
    }
  }
  return matchingTokens;
}

/**
 * @description Converts a hex color string to an RGB array
 * @param {string} hex
 * @returns {[number, number, number] | null} An RGB array or null if the hex string is invalid
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : null;
}

/**
 * @description Calculates the distance between two colors
 * @param {number[]} color1 {r, g, b}
 * @param {number[]} color2 {r, g, b}
 * @returns {number} The distance between the two colors
 */
function colorDistance(
  color1: [number, number, number],
  color2: [number, number, number]
): number {
  const rDiff = color1[0] - color2[0];
  const gDiff = color1[1] - color2[1];
  const bDiff = color1[2] - color2[2];
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

/**
 * @description Accepts a hex color string and returns a fuzzy match to the nearest token
 * @param {string} hexColor
 * @returns {string} The nearest token to the given color
 */
function findClosestColorToken(hexColor: string): string {
  const inputColor = hexToRgb(hexColor);
  if (!inputColor) {
    return "";
  }

  let minDistance = Number.MAX_VALUE;
  let closestToken = "";

  for (const [token, tokenColor] of colorTokens) {
    const tokenColorRgb = hexToRgb(tokenColor);
    if (!tokenColorRgb) {
      continue;
    }

    const distance = colorDistance(inputColor, tokenColorRgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestToken = token;
    }
  }

  return closestToken;
}

/**
 * @description A function that is called for each match of the spacing regex, used to create recommendations
 * @param {RegExpExecArray} match
 * @param {vscode.TextDocument} document
 * @param {vscode.Diagnostic[]} diagnostics
 * @param {vscode.DecorationOptions[]} decorations
 * @returns {void}
 */
function handleSpacingValue(
  match: RegExpExecArray,
  document: vscode.TextDocument,
  diagnostics: vscode.Diagnostic[],
  decorations: vscode.DecorationOptions[]
): void {
  const pxValueString = match[2].trim();
  const pxValues = pxValueString.match(/(\d+)px/g) || [];

  pxValues.forEach((pxValue) => {
    const value = parseInt(pxValue, 10);
    const startPosition = document.positionAt(
      (match.index ?? 0) + match[0].indexOf(pxValue)
    );
    const endPosition = startPosition.translate(0, pxValue.length);
    const range = new vscode.Range(startPosition, endPosition);

    const recommendation = findNearestSpacingToken(value / 16);
    const message = `DESIGN SYSTEM: Consider using '${recommendation}' instead of '${pxValue}'.`;

    diagnostics.push(
      new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning)
    );

    const decoration: vscode.DecorationOptions = {
      range,
      renderOptions: {
        after: {
          contentText: ` ⮀ ${recommendation}`,
        },
      },
    };

    decorations.push(decoration);
  });
}

/**
 * @description A function that is called for each match of the color regex, used to create recommendations
 * @param {RegExpExecArray} match
 * @param {vscode.TextDocument} document
 * @param {vscode.Diagnostic[]} diagnostics
 * @param {vscode.DecorationOptions[]} decorations
 * @returns {void}
 */
function handleColorValue(
  match: RegExpExecArray,
  document: vscode.TextDocument,
  diagnostics: vscode.Diagnostic[],
  decorations: vscode.DecorationOptions[]
): void {
  let colorValue = match[2].trim();

  if (colorValue.length === 4) {
    colorValue = `#${colorValue[1]}${colorValue[1]}${colorValue[2]}${colorValue[2]}${colorValue[3]}${colorValue[3]}`;
  }

  const startPosition = document.positionAt(match.index ?? 0);
  const endPosition = startPosition.translate(0, match[0].length);
  const range = new vscode.Range(startPosition, endPosition);

  const matchingTokens = findExactColorToken(colorValue);
  if (matchingTokens.length > 0) {
    const recommendedToken = matchingTokens[0];
    const alternatives = matchingTokens.slice(1);
    const alternativeText =
      alternatives.length > 0 ? `ALTERNATIVES: ${alternatives.join(", ")}` : "";
    const message = `DESIGN SYSTEM: Consider using '${recommendedToken}' instead of '${colorValue}'.\n${alternativeText}`;

    diagnostics.push(
      new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning)
    );
    const decoration: vscode.DecorationOptions = {
      range,
      renderOptions: {
        after: {
          contentText: ` ⮀ ${recommendedToken}`,
        },
      },
    };

    decorations.push(decoration);
  } else {
    const nearestToken = findClosestColorToken(colorValue);
    const message = `DESIGN SYSTEM: Consider using a token instead of '${colorValue}'.`;
    diagnostics.push(
      new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning)
    );
    const decoration: vscode.DecorationOptions = {
      range,
      renderOptions: {
        after: {
          contentText: ` ⛝ Unsupported. Best match: ${nearestToken}`,
        },
      },
    };

    decorations.push(decoration);
  }
}

/**
 * @description A linting function that performs regex matches on the document and calls the appropriate handler
 * @param {vscode.TextDocument} document
 * @returns {void}
 */
function lintDocument(document: vscode.TextDocument): void {
  if (!isEnabled) {
    return;
  }

  if (
    document.languageId !== "css" &&
    document.languageId !== "scss" &&
    document.languageId !== "svelte"
  ) {
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  const decorations: vscode.DecorationOptions[] = [];

  const text = document.getText();

  // Match spacing values in px
  const spacingRegex = /([\w-]+)\s*:\s*([\d\s]*(?:\d+px\b\s*)+)/g;
  // Match hex color values
  const colorRegex = /([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;

  let match: RegExpExecArray | null;

  // Handle spacing values
  while ((match = spacingRegex.exec(text)) !== null) {
    handleSpacingValue(match, document, diagnostics, decorations);
  }

  // Handle color values
  while ((match = colorRegex.exec(text)) !== null) {
    handleColorValue(match, document, diagnostics, decorations);
  }

  diagnosticCollection.set(document.uri, diagnostics);
  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor && activeTextEditor.document.uri === document.uri) {
    activeTextEditor.setDecorations(recommendationDecorationType, decorations);
  }
}

/**
 * @description A function that is called when the extension is activated
 * @param {vscode.ExtensionContext} context
 * @returns {void}
 */
export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection(
    "tokenRecommendations"
  );

  context.subscriptions.push(diagnosticCollection);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "+Tokens";
  statusBarItem.command = "tokenRecommendations.toggle";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register toggle command
  context.subscriptions.push(
    vscode.commands.registerCommand("tokenRecommendations.toggle", toggleTokens)
  );

  if (vscode.window.activeTextEditor) {
    lintDocument(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isEnabled) {
        lintDocument(editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isEnabled) {
        lintDocument(e.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isEnabled) {
        lintDocument(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnosticCollection.delete(document.uri);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("design-system-linter.designSystem")) {
        reloadExtension();
      }
    })
  );
}

/**
 * @description Reload the window when the user clicks the "Reload Window" button
 * @returns {void}
 */
async function reloadExtension(): Promise<void> {
  const reloadAction = "Reload Window";
  const result = await vscode.window.showInformationMessage(
    "Design System Linter configuration has changed. Please reload the window to apply the changes.",
    reloadAction
  );

  // If the user clicked the "Reload Window" button, execute the "workbench.action.reloadWindow" command
  if (result === reloadAction) {
    vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

/**
 * @description Called when extension is deactivated. Clears the diagnostic collection.
 * @returns {void}
 */
export function deactivate(): void {
  diagnosticCollection.clear();
}

loadDesignSystem(selectedDesignSystem);

let diagnosticCollection: vscode.DiagnosticCollection;

const recommendationDecorationType =
  vscode.window.createTextEditorDecorationType({
    after: {
      color: "rgba(255, 140, 0, 1)",
    },
  });
