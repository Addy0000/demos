"""Generates src/app/themes.css: twelve palettes x light/dark, as RGB triplets."""

def h(x):
    x = x.lstrip('#')
    return tuple(int(x[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    """t of a, 1-t of b."""
    a, b = h(a), h(b)
    return '#%02X%02X%02X' % tuple(round(a[i] * t + b[i] * (1 - t)) for i in range(3))


def trip(x):
    return ' '.join(str(v) for v in h(x))


STATUS_LIGHT = {
    'warning': '#FFA301', 'warning-text': '#8A5B00', 'warning-bg': '#FDF0DC',
    'danger': '#FF6349', 'danger-text': '#B3311F', 'danger-bg': '#FBE7E3',
    'special': '#6E7EA8', 'special-text': '#46527A', 'special-bg': '#E6E9F2',
}
GREEN = {'success': '#2E7D5B', 'success-text': '#1F5A41', 'success-bg': '#DDEEE5'}

P = {
    'teal': dict(navdeep='#212E30', nav='#263537', navraised='#2D4042', navtext='#C6CCCD', navdim='#8D9698',
                 primary='#248375', hover='#184841', accent='#5CA398', soft='#9AC1BD', brand='#2FDCC2',
                 pastel='#D9E8E5', faint='#E5E8EA', canvas='#EDEDED', surface='#FFFFFF', edge='#CACACA',
                 ink='#313131', muted='#6E7678', info=('#5CA398', '#35695F', '#E4EEEC'), selected='#C9DEDB',
                 scroll='#B4BCBD', success=('#248375', '#1B6157', '#DFEDEA')),
    'cobalt': dict(navdeep='#0E1A2C', nav='#13233A', navraised='#1B2F4C', navtext='#C3CCD8', navdim='#8593A6',
                   primary='#1F5FAF', hover='#15427B', accent='#4F86C6', soft='#9DBCE0', brand='#6FB7FF',
                   pastel='#DAE5F3', faint='#E3E8EF', canvas='#ECEFF3', surface='#FFFFFF', edge='#C7CED8',
                   ink='#2B2F36', muted='#667080', info=('#4F86C6', '#2E5A8C', '#E3ECF6'), selected='#C8D7EC',
                   scroll='#B3BCC8'),
    'forge': dict(navdeep='#1C1E21', nav='#25282C', navraised='#2F3338', navtext='#CBCDD0', navdim='#8E9297',
                  primary='#B4501C', hover='#7E3511', accent='#D07A45', soft='#E8B999', brand='#FF8A3D',
                  pastel='#F3E3D8', faint='#E6E5E3', canvas='#EEEDEB', surface='#FFFFFF', edge='#CBC8C4',
                  ink='#2E2C2A', muted='#6F6B67', info=('#5E7A8C', '#3D5566', '#E5ECF0'), selected='#EBCFBD',
                  scroll='#BDB8B2'),
    'indigo': dict(navdeep='#1A1528', nav='#221C33', navraised='#2C2541', navtext='#CFC9DB', navdim='#948CA8',
                   primary='#5B3E96', hover='#3F2A6A', accent='#8467BF', soft='#BFAEDF', brand='#B79CFF',
                   pastel='#E6E0F2', faint='#E7E5EC', canvas='#EFEDF3', surface='#FFFFFF', edge='#CBC6D6',
                   ink='#2D2A33', muted='#6E6880', info=('#7A68B0', '#4E3F80', '#ECE8F5'), selected='#D5CAEC',
                   scroll='#BCB5CB'),
    'graphite': dict(navdeep='#1F2123', nav='#2A2C2E', navraised='#34373A', navtext='#C9CBCD', navdim='#8D9195',
                     primary='#3B5B7A', hover='#283F55', accent='#6A88A6', soft='#A9BCCF', brand='#9CC3E8',
                     pastel='#DDE4EB', faint='#E5E6E8', canvas='#EDEEEF', surface='#FFFFFF', edge='#C9CBCE',
                     ink='#2F3133', muted='#6C7075', info=('#6A88A6', '#3E5770', '#E5EBF1'), selected='#CBD7E3',
                     scroll='#B6BABE'),
    'sand': dict(navdeep='#2C2722', nav='#36302A', navraised='#413A33', navtext='#D4CDC4', navdim='#9A9086',
                 primary='#8A5A1F', hover='#5F3D14', accent='#B07D3E', soft='#D9BC92', brand='#F2B866',
                 pastel='#F1E6D6', faint='#E9E4DC', canvas='#F0ECE6', surface='#FFFDF9', edge='#D0C8BC',
                 ink='#33302B', muted='#736B60', info=('#8A7A5E', '#5E5038', '#EFE9DE'), selected='#E6D5BC',
                 scroll='#C2B9AC'),
    'saffron': dict(navdeep='#241912', nav='#2E2018', navraised='#3A291F', navtext='#D8CCC2', navdim='#A08E80',
                    primary='#B4461B', hover='#7F2F10', accent='#D9733F', soft='#EDB894', brand='#FF9A5C',
                    pastel='#F6E2D6', faint='#ECE5DF', canvas='#F3EEE8', surface='#FFFDFB', edge='#D6CBC1',
                    ink='#33291F', muted='#77685B', info=('#7D8C5E', '#55613B', '#ECEFE3'), selected='#F0CDB8',
                    scroll='#C7B9AC'),
    'moss': dict(navdeep='#18211A', nav='#1F2A20', navraised='#283629', navtext='#C8D0C5', navdim='#8E9A8B',
                 primary='#4B6B2A', hover='#33491C', accent='#7A9A4F', soft='#B9CDA0', brand='#A8D46F',
                 pastel='#E2EAD6', faint='#E3E7DF', canvas='#ECEFE8', surface='#FFFFFF', edge='#C7CEC0',
                 ink='#2A2F27', muted='#69725F', info=('#5E8296', '#3C5A6B', '#E3EDF1'), selected='#D3E0C2',
                 scroll='#B5BDAD'),
    'crimson': dict(navdeep='#17191F', nav='#1E2027', navraised='#282B33', navtext='#CBCDD3', navdim='#8C909A',
                    primary='#A8283E', hover='#761A2B', accent='#D0566A', soft='#EAB0BA', brand='#FF5C77',
                    pastel='#F5DFE3', faint='#E7E6E9', canvas='#EEEDEF', surface='#FFFFFF', edge='#CBC9CE',
                    ink='#2B2B30', muted='#6C6C76', info=('#4F7497', '#33506C', '#E3EBF3'), selected='#EBC6CD',
                    scroll='#B9B7BE'),
    'plum': dict(navdeep='#1E1321', nav='#26182A', navraised='#322136', navtext='#D3C8D5', navdim='#9A8B9D',
                 primary='#7E2F6B', hover='#591F4B', accent='#A9599A', soft='#D8AACE', brand='#F08ADB',
                 pastel='#EFDDEA', faint='#E9E4E8', canvas='#F1ECF0', surface='#FFFFFF', edge='#D0C6CE',
                 ink='#2F2830', muted='#73687A', info=('#6A7FB0', '#45578A', '#E6EAF5'), selected='#E3C5DB',
                 scroll='#BDB2BB'),
    'ocean': dict(navdeep='#0B1A20', nav='#0F2229', navraised='#163039', navtext='#C3D1D5', navdim='#85989E',
                  primary='#0F6E83', hover='#0A4D5C', accent='#3F98AC', soft='#9CCAD5', brand='#4FD6F0',
                  pastel='#D7EAEE', faint='#E1E8EA', canvas='#E9F0F1', surface='#FFFFFF', edge='#C3CED1',
                  ink='#273033', muted='#63737A', info=('#5C7FB0', '#3B5A88', '#E4EAF4'), selected='#C3DFE6',
                  scroll='#AFBEC2'),
    'mono': dict(navdeep='#0F0F0F', nav='#151515', navraised='#1F1F1F', navtext='#CFCFCF', navdim='#8F8F8F',
                 primary='#262626', hover='#000000', accent='#6B6B6B', soft='#B5B5B5', brand='#FFFFFF',
                 pastel='#E6E6E6', faint='#E8E8E8', canvas='#F2F2F2', surface='#FFFFFF', edge='#C9C9C9',
                 ink='#1C1C1C', muted='#6A6A6A', info=('#5A6F8A', '#3B4C62', '#E6EAF0'), selected='#D6D6D6',
                 scroll='#B5B5B5', dark_primary='#6E6E6E', dark_hover='#858585'),
}


def light(p):
    s = p.get('success', (GREEN['success'], GREEN['success-text'], GREEN['success-bg']))
    t = {
        'nav-deep': p['navdeep'], 'nav': p['nav'], 'nav-raised': p['navraised'], 'nav-text': p['navtext'],
        'nav-dim': p['navdim'], 'primary': p['primary'], 'primary-hover': p['hover'], 'accent': p['accent'],
        'accent-soft': p['soft'], 'brand': p['brand'], 'pastel': p['pastel'], 'faint': p['faint'],
        'canvas': p['canvas'], 'surface': p['surface'], 'edge': p['edge'], 'ink': p['ink'], 'muted': p['muted'],
        'link': p['hover'], 'selected': p['selected'], 'scroll': p['scroll'],
        'success': s[0], 'success-text': s[1], 'success-bg': s[2],
        'info': p['info'][0], 'info-text': p['info'][1], 'info-bg': p['info'][2],
        'overlay': p['navdeep'],
    }
    t.update(STATUS_LIGHT)
    return t


def dark(p):
    canvas = mix(p['navdeep'], '#000000', 0.62)
    surface = mix(p['navdeep'], '#000000', 0.92)
    faint = mix(p['nav'], surface, 0.7)
    edge = mix(p['navtext'], surface, 0.2)
    primary = p.get('dark_primary') or mix(p['primary'], '#FFFFFF', 0.86)
    s = p.get('success', (GREEN['success'], GREEN['success-text'], GREEN['success-bg']))
    return {
        'nav-deep': mix(p['navdeep'], '#000000', 0.55), 'nav': mix(p['navdeep'], '#000000', 0.75),
        'nav-raised': p['navdeep'], 'nav-text': p['navtext'], 'nav-dim': p['navdim'],
        'primary': primary, 'primary-hover': p.get('dark_hover') or mix(p['primary'], '#FFFFFF', 0.74), 'accent': p['accent'],
        'accent-soft': mix(p['accent'], surface, 0.45), 'brand': p['brand'],
        'pastel': mix(p['primary'], surface, 0.28), 'faint': faint, 'canvas': canvas, 'surface': surface,
        'edge': edge, 'ink': '#E6E8EA', 'muted': '#9CA3A8', 'link': mix(p['accent'], '#FFFFFF', 0.55),
        'selected': mix(p['primary'], surface, 0.42), 'scroll': mix(p['navtext'], surface, 0.35),
        'success': mix(s[0], '#FFFFFF', 0.8), 'success-text': mix(s[0], '#FFFFFF', 0.45),
        'success-bg': mix(s[0], surface, 0.22),
        'info': p['info'][0], 'info-text': mix(p['info'][0], '#FFFFFF', 0.45), 'info-bg': mix(p['info'][0], surface, 0.2),
        'warning': '#FFB02E', 'warning-text': '#F5C56A', 'warning-bg': mix('#FFA301', surface, 0.16),
        'danger': '#FF7A63', 'danger-text': '#FF9C8B', 'danger-bg': mix('#FF6349', surface, 0.16),
        'special': '#8C9BC4', 'special-text': '#B3BEDD', 'special-bg': mix('#6E7EA8', surface, 0.2),
        'overlay': '#000000',
    }


def block(sel, tokens):
    body = '\n'.join(f'  --c-{k}: {trip(v)};' for k, v in tokens.items())
    return f'{sel} {{\n{body}\n}}\n'


out = ['/* Generated by scripts — twelve palettes, light and dark. Values are RGB triplets so\n'
       '   Tailwind opacity modifiers (bg-primary/12) keep working. */\n']
for i, (k, p) in enumerate(P.items()):
    sel = f':root,\nhtml[data-theme="{k}"]' if k == 'teal' else f'html[data-theme="{k}"]'
    out.append(block(sel, light(p)))
# Dark is a screen mode only: generated documents always print on light paper.
out.append('@media screen {\n')
for k, p in P.items():
    out.append(block(f'html[data-theme="{k}"][data-mode="dark"]', dark(p)))
out.append('}\n')
out.append('@media screen and (prefers-color-scheme: dark) {\n')
for k, p in P.items():
    out.append(block(f'html[data-theme="{k}"][data-mode="system"]', dark(p)))
out.append('}\n')

# Brand swatches for the picker and the company selector's brand morph.
out.append('\n/* Brand anchors per palette, as full colours for @property-driven morphs. */\n')
for k, p in P.items():
    out.append(f'[data-brand="{k}"] {{ --b-nav: {p["nav"]}; --b-deep: {p["navdeep"]}; --b-primary: {p["primary"]}; '
               f'--b-accent: {p["accent"]}; --b-text: {p["navtext"]}; --b-dim: {p["navdim"]}; --b-glow: {p["brand"]}; }}\n')

open('src/app/themes.css', 'w', encoding='utf-8').write('\n'.join(out))
print('ok', len(out))
