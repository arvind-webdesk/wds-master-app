#!/usr/bin/env node
/**
 * PreToolUse hook — blocks `asChild` usage on @base-ui/react-backed shadcn primitives.
 * Those wrappers (Sheet, Dialog, DropdownMenu, Command) ignore `asChild` and render
 * the default <button>, producing invalid nested-button HTML.
 *
 * The correct pattern for @base-ui/react is the `render` prop:
 *   <SheetTrigger render={<Button variant="ghost" />}>Menu</SheetTrigger>
 */

let raw = ''
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw)
    const input   = payload.tool_input ?? {}
    const content = input.content ?? input.new_string ?? ''
    const path    = input.file_path ?? ''

    // Allow inside the .claude/ folder (docs/templates may reference the anti-pattern)
    if (path.includes('.claude/')) process.exit(0)
    // Allow inside components/ui itself — that's where the primitives are defined
    if (/[\\/]components[\\/]ui[\\/]/.test(path)) process.exit(0)

    const BASEUI_IMPORT = /from\s+['"]@\/components\/ui\/(sheet|dialog|dropdown-menu|command)['"]/
    if (!BASEUI_IMPORT.test(content)) process.exit(0)

    // Look for asChild usage: `asChild` as a JSX prop
    const ASCHILD = /\basChild\b\s*(?:=|>|\s)/
    if (ASCHILD.test(content)) {
      process.stderr.write(
        '[no-aschild-on-baseui] `asChild` detected in ' + (path || 'this write') + '.\n' +
        'The Sheet / Dialog / DropdownMenu / Command wrappers in this project use @base-ui/react,\n' +
        'which does NOT support Radix\'s `asChild` prop — it is silently ignored, producing a\n' +
        'default <button> wrapping your child <Button>, which is invalid HTML.\n\n' +
        'Use the `render` prop instead:\n' +
        '  <SheetTrigger render={<Button variant="ghost" />}>Menu</SheetTrigger>\n' +
        '  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>...</DropdownMenuTrigger>\n\n' +
        'For DropdownMenuTrigger with a plain styled element, just pass className directly — it already\n' +
        'renders as <button>: <DropdownMenuTrigger className="...">...</DropdownMenuTrigger>\n',
      )
      process.exit(2)
    }
    process.exit(0)
  } catch {
    process.exit(0)
  }
})
