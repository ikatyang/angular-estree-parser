import { VERSION } from '@angular/compiler';
import * as ng from '@angular/compiler/src/expression_parser/ast';
import { Lexer } from '@angular/compiler/src/expression_parser/lexer';
import { Parser } from '@angular/compiler/src/expression_parser/parser';
import { RawNGComment, RawNGSpan } from './types';

const NG_PARSE_FAKE_LOCATION = 'angular-estree-parser';
const NG_PARSE_TEMPLATE_BINDINGS_FAKE_PREFIX = 'NgEstreeParser';
const NG_PARSE_FAKE_ABSOLUTE_OFFSET = 0;
const IS_LEGACY_VERSION = VERSION.major === '6' || VERSION.major === '7';
const extraParams = IS_LEGACY_VERSION
  ? [NG_PARSE_FAKE_LOCATION]
  : [NG_PARSE_FAKE_LOCATION, NG_PARSE_FAKE_ABSOLUTE_OFFSET];

function createNgParser() {
  return new Parser(new Lexer());
}

function parseNg(
  input: string,
  parse: (astInput: string, ngParser: Parser) => ng.ASTWithSource,
) {
  const ngParser = createNgParser();
  const { astInput, comments } = extractComments(input, ngParser);
  const { ast, errors } = parse(astInput, ngParser);
  assertAstErrors(errors);
  return { ast, comments };
}

export function parseNgBinding(input: string) {
  return parseNg(input, (astInput, ngParser) => {
    const args: any = [astInput, ...extraParams];
    return ngParser.parseBinding.apply(ngParser, args);
  });
}

export function parseNgSimpleBinding(input: string) {
  return parseNg(input, (astInput, ngParser) => {
    const args: any = [astInput, ...extraParams];
    return ngParser.parseSimpleBinding.apply(ngParser, args);
  });
}

export function parseNgAction(input: string) {
  return parseNg(input, (astInput, ngParser) => {
    const args: any = [astInput, ...extraParams];
    return ngParser.parseAction.apply(ngParser, args);
  });
}

export function parseNgTemplateBindings(input: string) {
  const ngParser = createNgParser();
  const args: any = [
    NG_PARSE_TEMPLATE_BINDINGS_FAKE_PREFIX,
    input,
    ...extraParams,
  ];
  const {
    templateBindings: ast,
    errors,
  } = ngParser.parseTemplateBindings.apply(ngParser, args);
  assertAstErrors(errors);
  return ast;
}

export function parseNgInterpolation(input: string) {
  const ngParser = createNgParser();
  const { astInput, comments } = extractComments(input, ngParser);
  const prefix = '{{';
  const suffix = '}}';
  const args: any = [prefix + astInput + suffix, ...extraParams];
  const { ast: rawAst, errors } = ngParser.parseInterpolation.apply(
    ngParser,
    args,
  )!;
  assertAstErrors(errors);
  const ast = (rawAst as ng.Interpolation).expressions[0];
  visitSpan(ast, span => {
    span.start -= prefix.length;
    span.end -= prefix.length;
  });
  return { ast, comments };
}

function visitSpan(ast: any, fn: (span: ng.ParseSpan) => void): void {
  if (!ast || typeof ast !== 'object') {
    return;
  }

  if (Array.isArray(ast)) {
    return ast.forEach(value => visitSpan(value, fn));
  }

  for (const key of Object.keys(ast)) {
    const value = ast[key];
    if (key === 'span') {
      fn(value);
    } else {
      visitSpan(value, fn);
    }
  }
}

function assertAstErrors(errors: ng.ParserError[]) {
  if (errors.length !== 0) {
    const [{ message }] = errors;
    throw new SyntaxError(
      message.replace(/^Parser Error: | at column \d+ in [^]*$/g, ''),
    );
  }
}

function extractComments(
  input: string,
  ngParser: Parser,
): { astInput: string; comments: RawNGComment[] } {
  // @ts-ignore
  const commentStart: number | null = ngParser._commentStart(input);
  return commentStart === null
    ? { astInput: input, comments: [] }
    : {
        astInput: input.slice(0, commentStart),
        comments: [
          {
            type: 'Comment',
            value: input.slice(commentStart + '//'.length),
            span: { start: commentStart, end: input.length },
          },
        ],
      };
}

// prettier-ignore
export function getNgType(node: (ng.AST | RawNGComment) & { type?: string }) {
  if (node instanceof ng.Binary) { return 'Binary'; }
  if (node instanceof ng.BindingPipe) { return "BindingPipe"; }
  if (node instanceof ng.Chain) { return "Chain"; }
  if (node instanceof ng.Conditional) { return "Conditional"; }
  if (node instanceof ng.EmptyExpr) { return "EmptyExpr"; }
  if (node instanceof ng.FunctionCall) { return "FunctionCall"; }
  if (node instanceof ng.ImplicitReceiver) { return "ImplicitReceiver"; }
  if (node instanceof ng.KeyedRead) { return "KeyedRead"; }
  if (node instanceof ng.KeyedWrite) { return "KeyedWrite"; }
  if (node instanceof ng.LiteralArray) { return "LiteralArray"; }
  if (node instanceof ng.LiteralMap) { return "LiteralMap"; }
  if (node instanceof ng.LiteralPrimitive) { return "LiteralPrimitive"; }
  if (node instanceof ng.MethodCall) { return "MethodCall"; }
  if (node instanceof ng.NonNullAssert) { return "NonNullAssert"; }
  if (node instanceof ng.PrefixNot) { return "PrefixNot"; }
  if (node instanceof ng.PropertyRead) { return "PropertyRead"; }
  if (node instanceof ng.PropertyWrite) { return "PropertyWrite"; }
  if (node instanceof ng.Quote) { return "Quote"; }
  if (node instanceof ng.SafeMethodCall) { return "SafeMethodCall"; }
  if (node instanceof ng.SafePropertyRead) { return "SafePropertyRead"; }
  return node.type;
}

function stripSurroundingSpaces(
  { start: startIndex, end: endIndex }: RawNGSpan,
  text: string,
) {
  let start = startIndex;
  let end = endIndex;

  while (end !== start && /\s/.test(text[end - 1])) {
    end--;
  }

  while (start !== end && /\s/.test(text[start])) {
    start++;
  }

  return { start, end };
}

function expandSurroundingSpaces(
  { start: startIndex, end: endIndex }: RawNGSpan,
  text: string,
) {
  let start = startIndex;
  let end = endIndex;

  while (end !== text.length && /\s/.test(text[end])) {
    end++;
  }

  while (start !== 0 && /\s/.test(text[start - 1])) {
    start--;
  }

  return { start, end };
}

function expandSurroundingParens(span: RawNGSpan, text: string) {
  return text[span.start - 1] === '(' && text[span.end] === ')'
    ? { start: span.start - 1, end: span.end + 1 }
    : span;
}

export function fitSpans(
  span: RawNGSpan,
  text: string,
  hasParentParens: boolean,
): { outerSpan: RawNGSpan; innerSpan: RawNGSpan; hasParens: boolean } {
  let parensCount = 0;

  const outerSpan = { start: span.start, end: span.end };

  while (true) {
    const spacesExpandedSpan = expandSurroundingSpaces(outerSpan, text);
    const parensExpandedSpan = expandSurroundingParens(
      spacesExpandedSpan,
      text,
    );

    if (
      spacesExpandedSpan.start === parensExpandedSpan.start &&
      spacesExpandedSpan.end === parensExpandedSpan.end
    ) {
      break;
    }

    outerSpan.start = parensExpandedSpan.start;
    outerSpan.end = parensExpandedSpan.end;

    parensCount++;
  }

  return {
    hasParens: (hasParentParens ? parensCount - 1 : parensCount) !== 0,
    outerSpan: stripSurroundingSpaces(
      hasParentParens
        ? { start: outerSpan.start + 1, end: outerSpan.end - 1 }
        : outerSpan,
      text,
    ),
    innerSpan: stripSurroundingSpaces(span, text),
  };
}

export function findFrontChar(regex: RegExp, index: number, text: string) {
  let i = index;
  while (!regex.test(text[i])) {
    i--;
  }
  return i;
}

export function findBackChar(regex: RegExp, index: number, text: string) {
  let i = index;
  while (!regex.test(text[i])) {
    i++;
  }
  return i;
}

export function toLowerCamelCase(str: string) {
  return str.slice(0, 1).toLowerCase() + str.slice(1);
}

export function getLast<T>(array: T[]): T | undefined {
  return array.length === 0
    ? // istanbul ignore next
      undefined
    : array[array.length - 1];
}
