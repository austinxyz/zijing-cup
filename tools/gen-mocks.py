# -*- coding: utf-8 -*-
"""Generate the opsx mocks file FROM the design canvas artboards.

The artboards under design/*.dc.html are the single source of truth for the
mocks. This script derives the self-contained HTML that /opsx:propose expects,
so the two never drift by hand-editing. Re-run after changing an artboard.
"""
import io
import os
import re
import sys

ROOT = sys.argv[1]
DESIGN = os.path.join(ROOT, 'design')
OUT = os.path.join(ROOT, 'docs/superpowers/specs/mocks/2026-08-27-rules-and-design-system-mocks.html')

SECTIONS = [
    ('desktop', '桌面 · 赛制规则页', 'Rules.dc.html',
     '/2026/silver/rules —— 应用壳 + 赛制规则页。侧栏含赛季×组别切换器；队伍与分析为禁用态。'),
    ('mobile', '移动 · 赛制规则页', 'RulesMobile.dc.html',
     '同一页面的移动版。侧栏收为顶栏，切换器仍在首屏；命中区 ≥44px；参赛 UTR 明细收为二级入口。'),
]


def extract(path):
    """Pull the <helmet> styles and the artboard markup out of a .dc.html file."""
    src = io.open(path, encoding='utf-8').read()
    style = re.search(r'<style>(.*?)</style>', src, re.S)
    body = re.search(r'</helmet>(.*?)</x-dc>', src, re.S)
    if not style or not body:
        raise SystemExit('cannot parse %s' % path)
    return style.group(1).strip(), body.group(1).strip()


blocks = []
styles = []
for idx, (sid, title, filename, note) in enumerate(SECTIONS):
    css, markup = extract(os.path.join(DESIGN, filename))
    # Scope each artboard's helmet CSS to its own section so the two cannot
    # collide (both define .th/.td/.cardTitle for their own density).
    scoped = re.sub(r'(^|\})\s*([^{}@]+)\{', lambda m: '%s\n#%s %s{' % (m.group(1), sid, m.group(2).strip()), css)
    scoped = scoped.replace('#%s body' % sid, '#%s' % sid)
    styles.append('/* ---- %s ---- */\n%s' % (title, scoped))
    blocks.append('''  <section id="%s">
    <header class="mockHead">
      <h2>%s</h2>
      <p>%s</p>
      <p class="src">来源画板：<code>design/%s</code></p>
    </header>
    <div class="frame">
%s
    </div>
  </section>''' % (sid, title, note, filename, markup))

doc = '''<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rules-and-design-system — mocks</title>
<style>
  :root {
    --bg: #f6f4f0; --fg: #1a1917; --surface: #ffffff; --surface-muted: #f2efe9;
    --border: #e4e0d8; --primary: #9c3417; --muted: #79736a; --muted-fg: #a09a90;
    --danger: #b3261e; --success: #4c8a63; --warning: #b8860b;
    --sidebar: #1c1b18; --sidebar-border: #2a2823; --radius: 0.5rem;
  }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: "Noto Sans SC", "Segoe UI", sans-serif;
  }
  .page { max-width: 1720px; margin: 0 auto; padding: 32px 24px 64px; }
  .intro { max-width: 760px; margin-bottom: 32px; }
  .intro h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
  .intro p { font-size: 14px; line-height: 1.7; color: var(--muted); margin: 0 0 8px; }
  .intro code, .src code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12.5px; }
  .tokens { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .tok {
    display: flex; align-items: center; gap: 7px; border: 1px solid var(--border);
    border-radius: var(--radius); background: var(--surface); padding: 5px 10px;
    font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; color: var(--muted);
  }
  .sw { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(0,0,0,.08); }
  section { margin-bottom: 40px; }
  .mockHead { margin-bottom: 12px; }
  .mockHead h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  .mockHead p { font-size: 13px; line-height: 1.6; color: var(--muted); margin: 0; }
  .mockHead .src { margin-top: 4px; font-size: 12px; color: var(--muted-fg); }
  .frame {
    display: inline-block; max-width: 100%%; overflow-x: auto;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface);
  }
%s
</style>
</head>
<body>
<div class="page">
  <div class="intro">
    <h1>rules-and-design-system — 界面稿</h1>
    <p>本文件由 <code>design/*.dc.html</code> 生成，<strong>不要手工编辑</strong>。
       画板是唯一事实来源；改动画板后重新生成，避免同一套 token 存在两份而漂移。</p>
    <p>设计系统移植自 ai-course-management，数值逐项照搬。锁定的是 token 与文案，
       不是像素尺寸。</p>
    <div class="tokens">
      <span class="tok"><span class="sw" style="background:#f6f4f0"></span>bg #f6f4f0</span>
      <span class="tok"><span class="sw" style="background:#ffffff"></span>surface #ffffff</span>
      <span class="tok"><span class="sw" style="background:#f2efe9"></span>surface-muted #f2efe9</span>
      <span class="tok"><span class="sw" style="background:#e4e0d8"></span>border #e4e0d8</span>
      <span class="tok"><span class="sw" style="background:#9c3417"></span>primary #9c3417</span>
      <span class="tok"><span class="sw" style="background:#1c1b18"></span>sidebar #1c1b18</span>
      <span class="tok"><span class="sw" style="background:#b8860b"></span>warning #b8860b</span>
      <span class="tok"><span class="sw" style="background:#b3261e"></span>danger #b3261e</span>
      <span class="tok">radius 0.5rem</span>
      <span class="tok">Noto Sans SC / JetBrains Mono</span>
    </div>
  </div>

%s
</div>
</body>
</html>
''' % ('\n'.join(styles), '\n\n'.join(blocks))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, 'w', encoding='utf-8', newline='').write(doc)
print('wrote %s (%d bytes)' % (OUT, len(doc)))
