# Change Log

All notable changes to the "Design System Linter" extension will be documented in this file.

## [0.1.19] - 2024-10-16
### Added
- Added code to allow users to disable warnings for custom token settings.

## [0.1.18] - 2023-05-12
### Added
- Configuration section for token prefix

### Changed
- Removed hardcoded token prefix and allows users to specify a custom prefix in the extension settings.
  - Defaults to "variables."

## [0.1.17] - 2023-05-12
### Added
- Implemented Code Actions to allow users to quickly fix linting errors.

## [0.1.16] - 2023-05-02
### Changed
- Updated README with a demo and images of the extension in action.

## [0.1.15] - 2023-05-01
### Added
- Support for floating-point values in spacing detection and recommendations. The extension can now handle both "px" and "rem" units with whole numbers or decimals (e.g., "1.25rem").

### Changed
- Improved spacing detection and recommendation logic to accommodate floating-point values for both "px" and "rem" units.

## [0.1.14]
- Added missing colors to IBM Carbon

## [0.1.13]
- Minor updates to documentation

## [0.1.12]
- Added native support for IBM Carbon Design System tokens

## [0.1.11]
- Resolved an error that was including extraneous files in the extension package.

## [0.1.10]
### Added
- Added `designSystem` setting to allow users to select a predefined design system or use a custom design system.
  - The currently available options are:
    - "default": The built-in default design system
    - "custom": Use a custom design system defined in your `settings.json`
  - Introduced support for custom design system tokens:
    - design-system-linter.customSpacingTokens for custom spacing tokens.
    - design-system-linter.customColorTokens for custom color tokens.
  - Updated README to include instructions for selecting a design system and utilizing a custom option.
### Changed
- Refactored the code to handle the new design system selection functionality and load custom tokens when the "custom" option is selected.

## [0.1.9]
- Minor updates to configuration and package files

## [0.1.8]
- Updated name to "Design System Linter"
- Added configuration support to override tokens
- Added reset command to reset configuration to default values

## [0.1.7]
- Support for fuzzy matching of color tokens

## [0.1.6]
- Unsupported color token warnings

## [0.1.5]
- Updated colors to match 3 digit hex values

## [0.1.4]
- Updated color regex
- Color token tooltip will now provide a list of all matching options

## [0.1.3]
- Updated README.md; Hex color tokens were being displayed as links erroneously.

## [0.1.2]
- Implemented color tokens

## [0.1.1]
- Updated changelog

## [0.1.0]
- Initial release