# Delta Spec: read_pdf_vision Tool

## ADDED Requirements

### Requirement: PDF Vision Recognition Tool
The system SHALL provide a `read_pdf_vision` tool that renders PDF pages to images and uses a vision-capable LLM to extract text and table content.

#### Scenario: Scanned PDF with tables
- GIVEN a scanned PDF file with tabular data
- WHEN `read_pdf_vision` is called with the file path
- THEN each page is rendered to a temporary PNG image
- AND each image is sent to a vision LLM for recognition
- AND the recognized text (with Markdown tables) is returned
- AND all temporary PNG files are physically deleted

#### Scenario: Partial failure with resume
- GIVEN a 10-page PDF where page 7 recognition fails
- WHEN the error occurs
- THEN pages 1-6 results are cached to a temp JSON file
- AND the error message includes which pages succeeded and which failed
- AND on retry, only pages 7-10 are re-recognized

#### Scenario: Cost-optimized model selection
- GIVEN the user has Copilot configured
- WHEN `read_pdf_vision` needs to call vision LLM
- THEN it MUST use Copilot GPT-4o provider (not the user's current chat model)

#### Scenario: No Copilot fallback
- GIVEN the user has NOT configured Copilot
- WHEN `read_pdf_vision` needs to call vision LLM
- THEN it SHALL use the user's current configured model

### Requirement: Temporary File Cleanup
The system MUST physically delete (`fs.unlinkSync`) all generated PNG files after recognition completes, whether successful or failed.

### Requirement: Cache for Resume
The system MUST write partial results to a `.equality-pdf-cache-<hash>.json` file in the system temp directory. On re-invocation of the same PDF, it SHALL skip already-recognized pages.

## MODIFIED Requirements

### Requirement: read_pdf Auto-Fallback
The existing `read_pdf` tool SHALL detect when extracted text is insufficient (< 50 chars) and automatically invoke `read_pdf_vision` instead of just returning a suggestion message.

#### Scenario: Auto-fallback for scanned PDF
- GIVEN a scanned PDF with no text layer
- WHEN `read_pdf` is called
- THEN it detects < 50 chars of text
- AND automatically delegates to `read_pdf_vision`
- AND returns the vision recognition result

#### Scenario: User tool override
- GIVEN the user explicitly selected `#read_pdf` via mention
- WHEN the PDF is a scanned document
- THEN `read_pdf` still auto-falls back to `read_pdf_vision` (the `#` selected the domain, not the implementation)

#### Scenario: User explicitly selects read_pdf_vision
- GIVEN the user explicitly selected `#read_pdf_vision`
- WHEN processing any PDF
- THEN `read_pdf_vision` is used directly (skip text extraction attempt)
