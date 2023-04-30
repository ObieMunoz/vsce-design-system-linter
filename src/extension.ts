import * as vscode from "vscode";

const tokens: [string, number][] = [
  ["$size-spacing-0", 0],
  ["$size-spacing-1", 0.25],
  ["$size-spacing-2", 0.5],
  ["$size-spacing-3", 0.75],
  ["$size-spacing-4", 1],
  ["$size-spacing-5", 1.25],
  ["$size-spacing-6", 1.5],
  ["$size-spacing-7", 1.75],
  ["$size-spacing-8", 2],
  ["$size-spacing-9", 2.25],
  ["$size-spacing-10", 2.5],
  ["$size-spacing-11", 2.75],
  ["$size-spacing-12", 3],
  ["$size-spacing-14", 3.5],
  ["$size-spacing-16", 4],
  ["$size-spacing-20", 5],
  ["$size-spacing-24", 6],
  ["$size-spacing-28", 7],
  ["$size-spacing-32", 8],
  ["$size-spacing-36", 9],
  ["$size-spacing-40", 10],
  ["$size-spacing-44", 11],
  ["$size-spacing-48", 12],
  ["$size-spacing-52", 13],
  ["$size-spacing-56", 14],
  ["$size-spacing-60", 15],
  ["$size-spacing-64", 16],
  ["$size-spacing-72", 18],
  ["$size-spacing-80", 20],
  ["$size-spacing-96", 24],
  ["$size-spacing-px", 0.0625],
  ["$size-spacing-0-5", 0.125],
  ["$breakpoint-md", 37.5],
  ["$breakpoint-lg", 56.563],
  ["$breakpoint-xl", 77.5],
];

let isEnabled = true;
let statusBarItem: vscode.StatusBarItem;

function toggleTokens() {
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

function clearRecommendations() {
  diagnosticCollection.clear();
  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor) {
    activeTextEditor.setDecorations(recommendationDecorationType, []);
  }
}

function findNearestToken(value: number): string {
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

let diagnosticCollection: vscode.DiagnosticCollection;

const recommendationDecorationType =
  vscode.window.createTextEditorDecorationType({
    after: {
      color: "rgba(255, 140, 0, 1)",
    },
  });

function lintDocument(document: vscode.TextDocument) {
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
  const regex = /([\w-]+)\s*:\s*([\d\s]*(?:\d+px\b\s*)+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const pxValueString = match[2].trim();
    const pxValues = pxValueString.match(/(\d+)px/g) || [];

    pxValues.forEach((pxValue) => {
      const value = parseInt(pxValue, 10);
      const startPosition = document.positionAt(
        (match?.index ?? 0) + (match ? match[0].indexOf(pxValue) : 0)
      );
      const endPosition = startPosition.translate(0, pxValue.length);
      const range = new vscode.Range(startPosition, endPosition);

      const recommendation = findNearestToken(value / 16);
      const message = `Consider using '${recommendation}' instead of '${pxValue}'.`;

      diagnostics.push(
        new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning)
      );
      const decoration: vscode.DecorationOptions = {
        range,
        renderOptions: {
          after: {
            contentText: ` ⟶ ${recommendation}`,
          },
        },
      };

      decorations.push(decoration);
    });
  }

  diagnosticCollection.set(document.uri, diagnostics);
  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor && activeTextEditor.document.uri === document.uri) {
    activeTextEditor.setDecorations(recommendationDecorationType, decorations);
  }
}

export function activate(context: vscode.ExtensionContext) {
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
}

export function deactivate() {
  diagnosticCollection.clear();
}
