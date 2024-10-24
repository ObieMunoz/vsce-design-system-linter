import * as vscode from "vscode";

const config = vscode.workspace.getConfiguration("design-system-linter");
const selectedDesignSystem = config.get<string>("designSystem") || "default";
const enableSpacingLint = config.get<boolean>("enableSpacingLint") ?? true;
const enableColorLint = config.get<boolean>("enableColorLint") ?? true;

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
  switch (system) {
    case "IBM Carbon":
      const ibmCarbon = await import("./design-systems/ibmcarbon.json");
      tokens = Object.entries(ibmCarbon.spacing);
      colorTokens = Object.entries(ibmCarbon.colors);
      break;
    case "Custom":
      tokens = config.get<[string, number][]>("customSpacingTokens") || [];
      colorTokens = config.get<[string, string][]>("customColorTokens") || [];
      break;
    default:
      const defaultSystem = await import("./design-systems/default.json");
      tokens = Object.entries(defaultSystem.spacing);
      colorTokens = Object.entries(defaultSystem.colors);
      break;
  }
}

/**
 * @description Command to apply the recommendation
 * @param {vscode.TextDocument} document
 * @param {vscode.Range} range
 * @param {string} recommendation
 * @returns {Promise<void>}
 */
async function applyRecommendation(
  document: vscode.TextDocument,
  range: vscode.Range,
  recommendation: string
): Promise<void> {
  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.replace(document.uri, range, recommendation);
  await vscode.workspace.applyEdit(workspaceEdit);
}

class RecommendationCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    if (context.diagnostics.length === 0) {
      return [];
    }

    if (document.languageId === "svelte") {
      const text = document.getText();
      const offset = document.offsetAt(range.start);

      if (!this.isWithinStyleTag(text, offset)) {
        return [];
      }
    }

    const diagnostic = context.diagnostics[0];
    const recommendation = diagnostic.message.split("'")[1];
    const tokenPrefix = config.get("tokenPrefix");

    const action = new vscode.CodeAction(
      `Apply recommendation: ${recommendation}`,
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diagnostic];
    action.command = {
      command: "tokenRecommendations.applyRecommendation",
      title: "Apply Recommendation",
      arguments: [
        document,
        diagnostic.range,
        `${tokenPrefix}${recommendation}`,
      ],
    };
    action.isPreferred = true;
    return [action];
  }

  private isWithinStyleTag(text: string, offset: number): boolean {
    const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let match: RegExpExecArray | null;

    while ((match = styleTagRegex.exec(text)) !== null) {
      const styleTagStart = match.index + match[0].indexOf(">") + 1;
      const styleTagEnd = match.index + match[0].length - "</style>".length;

      if (offset >= styleTagStart && offset <= styleTagEnd) {
        return true;
      }
    }

    return false;
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
function findNearestSpacingToken(
  value: number,
  unit: "px" | "rem" = "rem"
): string {
  let minDiff = Number.MAX_VALUE;
  let nearestToken = "";

  for (const [token, tokenValue] of tokens) {
    if (typeof tokenValue === "number") {
      const tokenValueWithUnit = unit === "px" ? tokenValue * 16 : tokenValue;
      const diff = Math.abs(tokenValueWithUnit - value);
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
  const valueString = match[2].trim();
  const values = valueString.match(/(\d+(?:\.\d+)?(?:px|rem))/g) || [];
  const isSvelteFile = document.languageId === "svelte";
  const fullText = document.getText();

  values.forEach((valueWithUnit) => {
    const unit = valueWithUnit.endsWith("px") ? "px" : "rem";
    const value = parseFloat(valueWithUnit);

    const valueOffset = (match.index ?? 0) + match[0].indexOf(valueWithUnit);
    const adjustedOffset = isSvelteFile
      ? adjustSveltePosition(valueOffset, fullText)
      : valueOffset;
    const startPosition = document.positionAt(adjustedOffset);
    const endPosition = startPosition.translate(0, valueWithUnit.length);
    const range = new vscode.Range(startPosition, endPosition);

    let recommendation: string;
    if (unit === "px") {
      recommendation = findNearestSpacingToken(value / 16);
    } else {
      recommendation = findNearestSpacingToken(value);
    }

    const message = `DESIGN SYSTEM: Consider using '${recommendation}' instead of '${valueWithUnit}'.`;
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

  const isSvelteFile = document.languageId === "svelte";
  const fullText = document.getText();
  const valueOffset =
    (match.index ?? 0) + match[0].indexOf(colorValue.slice(0, 3));
  const adjustedOffset = isSvelteFile
    ? adjustSveltePosition(valueOffset, fullText)
    : valueOffset;

  const startPosition = document.positionAt(adjustedOffset);
  const endPosition = startPosition.translate(0, colorValue.length);
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
    const message = `DESIGN SYSTEM: Consider using '${nearestToken}' instead of '${colorValue}'.`;

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

  let textToLint: string;

  if (document.languageId === "svelte") {
    textToLint = extractStyleTagContents(document.getText());
  } else {
    textToLint = document.getText();
  }

  let match: RegExpExecArray | null;

  // Handle spacing values
  if (enableSpacingLint) {
    const spacingRegex =
      /([\w-]+)\s*:\s*([\d\s]*(?:\d+(?:\.\d+)?(?:px|rem)\b\s*)+)/g;
    while ((match = spacingRegex.exec(textToLint)) !== null) {
      handleSpacingValue(match, document, diagnostics, decorations);
    }
  }

  // Handle color values
  if (enableColorLint) {
    const colorRegex = /([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;
    while ((match = colorRegex.exec(textToLint)) !== null) {
      handleColorValue(match, document, diagnostics, decorations);
    }
  }

  diagnosticCollection.set(document.uri, diagnostics);
  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor && activeTextEditor.document.uri === document.uri) {
    activeTextEditor.setDecorations(recommendationDecorationType, decorations);
  }
}

/**
 * @description Extracts contents of all style tags from a Svelte file
 * @param {string} text - The full text content of the Svelte file
 * @returns {string} Concatenated contents of all style tags
 */
function extractStyleTagContents(text: string): string {
  const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let styleContents: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = styleTagRegex.exec(text)) !== null) {
    styleContents.push(match[1]);
  }

  return styleContents.join("\n");
}

/**
 * @description Updates position information for diagnostics and decorations in Svelte files
 * @param {number} offset - The offset within the style tag
 * @param {string} fullText - The full document text
 * @returns {number} The actual position in the document
 */
function adjustSveltePosition(offset: number, fullText: string): number {
  const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let currentOffset = 0;
  let match: RegExpExecArray | null;

  while ((match = styleTagRegex.exec(fullText)) !== null) {
    const styleContent = match[1];
    const styleTagStart = match.index + match[0].indexOf(">") + 1;

    if (currentOffset + styleContent.length >= offset) {
      return styleTagStart + (offset - currentOffset);
    }

    currentOffset += styleContent.length + 1;
  }

  return offset;
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
      const affectedSettings = [
        "design-system-linter.designSystem",
        "design-system-linter.enableSpacingLint",
        "design-system-linter.enableColorLint",
        "design-system-linter.customSpacingTokens",
        "design-system-linter.customColorTokens",
      ];

      const shouldReload = affectedSettings.some((setting) =>
        event.affectsConfiguration(setting)
      );

      if (shouldReload) {
        reloadExtension();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tokenRecommendations.applyRecommendation",
      applyRecommendation
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ["css", "scss", "svelte"],
      new RecommendationCodeActionProvider(),
      {
        providedCodeActionKinds:
          RecommendationCodeActionProvider.providedCodeActionKinds,
      }
    )
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
