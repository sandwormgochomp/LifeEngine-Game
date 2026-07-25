#!/usr/bin/env python3
"""Guardrail: find component CSS that silently loses to the shared kit.

Component modules in src/components/styles/ compose primitives from
styles/kit/*.module.css. The bundler emits the kit AFTER the component modules,
so when a component class sits on the same element as a composed kit class and
redeclares one of its properties, the two have equal specificity and the kit
wins on source order -- the component's override disappears with no error.

The fix at each site is to double the component's selector (.thing.thing), which
raises it to (0,2,0) and makes it win regardless of emission order.

Run: python3 scripts/css-kit-conflicts.py   (exit 1 if any site needs bumping)

Not reported: cases where the kit declaration is !important and the component's
is not. Those are decided by weight, not order, so they behave the same however
the files are emitted.
"""
import re, glob, os, collections, sys

ALIAS_TARGET = {
    'panelHeader': ('Surface', 'header'), 'panelTitle': ('Surface', 'title'),
    'panelClose': ('Surface', 'close'), 'panelBody': ('Surface', 'body'),
    'active': ('Surface', 'buttonActive'), 'modalBackdrop': ('Surface', 'backdrop'),
    'pickerModal': ('Surface', 'modal'), 'pickerGrid': ('Picker', 'grid'),
    'pickerEmpty': ('Picker', 'empty'), 'pickerCard': ('Picker', 'card'),
    'pickerName': ('Picker', 'name'), 'pickerMeta': ('Picker', 'meta'),
    'ctrlGroup': ('Control', 'group'), 'ctrlRow': ('Control', 'row'),
    'ctrlLabel': ('Control', 'label'), 'ctrlNumber': ('Control', 'number'),
    'ctrlValue': ('Control', 'value'), 'ctrlFooter': ('Control', 'footer'),
    'ctrlNote': ('Control', 'note'), 'dockNameInput': ('Control', 'textInput'),
    'statsBar': ('Bar', 'bar'), 'statDivider': ('Bar', 'divider'),
}
ALIASES = set(ALIAS_TARGET)
SIDES = ['top', 'right', 'bottom', 'left']
EXPAND = {
    'padding': [f'padding-{s}' for s in SIDES],
    'margin': [f'margin-{s}' for s in SIDES],
    'border': ['border-width', 'border-style', 'border-color']
              + [f'border-{s}-{p}' for s in SIDES for p in ('width', 'style', 'color')],
    'border-color': [f'border-{s}-color' for s in SIDES],
    'border-width': [f'border-{s}-width' for s in SIDES],
    'border-style': [f'border-{s}-style' for s in SIDES],
    'background': ['background-color', 'background-image', 'background-position',
                   'background-size', 'background-repeat'],
    'font': ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height'],
    'flex': ['flex-grow', 'flex-shrink', 'flex-basis'],
    'gap': ['row-gap', 'column-gap'],
    'inset': SIDES,
    'overflow': ['overflow-x', 'overflow-y'],
}


def longhands(prop):
    """Every property name this declaration can control, shorthand or long."""
    out = {prop} | set(EXPAND.get(prop, []))
    for shorthand, expanded in EXPAND.items():
        if prop in expanded:
            out.add(shorthand)
    return out


def declarations(path):
    """class -> {property: is_important} for plain single-class rules."""
    text = re.sub(r'/\*.*?\*/', '', open(path).read(), flags=re.S)
    out = collections.defaultdict(dict)
    for selector, body in re.findall(r'([^{}]+)\{([^{}]*)\}', text):
        selector = selector.strip()
        if selector.startswith('@'):
            continue
        m = re.fullmatch(r'\.([A-Za-z][\w-]*)', selector)
        if not m:
            continue
        for decl in body.split(';'):
            if ':' not in decl:
                continue
            prop = decl.split(':')[0].strip()
            if prop == 'composes':
                continue
            important = '!important' in decl
            for p in longhands(prop):
                out[m.group(1)][p] = important or out[m.group(1)].get(p, False)
    return out


kit = {os.path.basename(f).split('.')[0]: declarations(f)
       for f in glob.glob('src/components/styles/kit/*.module.css')}

hits = set()
for tsx in sorted(glob.glob('src/components/**/*.tsx', recursive=True)):
    source = open(tsx).read()
    m = re.search(r"import (\w+) from '(.+?/styles/(\w+)\.module\.css)'", source)
    if not m:
        continue
    ident, mod = m.group(1), m.group(2)
    path = os.path.normpath(os.path.join(os.path.dirname(tsx), mod))
    if not os.path.exists(path) or 'kit/' in mod:
        continue
    local = declarations(path)
    for line in source.split('\n'):
        if 'className' not in line:
            continue
        names = list(dict.fromkeys(re.findall(r'\b%s\.([A-Za-z][\w]*)' % ident, line)))
        if len(names) < 2:
            continue
        for alias in names:
            if alias not in ALIASES:
                continue
            kit_file, kit_class = ALIAS_TARGET[alias]
            kit_decls = kit[kit_file].get(kit_class, {})
            for other in names:
                if other == alias or other in ALIASES:
                    continue
                mine = local.get(other, {})
                clash = sorted(p for p in kit_decls.keys() & mine.keys()
                               # weight, not order, decides this one
                               if not (kit_decls[p] and not mine[p]))
                if clash:
                    hits.add((os.path.basename(path), other,
                              f'{kit_file}.{kit_class}', tuple(clash)))

for h in sorted(hits):
    print(f"  {h[0]:28s} .{h[1]:22s} overrides kit {h[2]:18s} {list(h[3])}")
print(f"{len(hits)} site(s) needing a doubled selector"
      if hits else "clean: no component override loses to the kit on source order")
sys.exit(1 if hits else 0)
