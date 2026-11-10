# build-cards.py — writes the four colour cards into site/index.html.
#
# A friendly parody of creature trading cards: a "Stage 1" creature that
# evolves from a primitive form, CU (Fabric Capacity Units) instead of a life
# stat, a type icon, two "attacks" that are real DP-700 skills, plus a joke
# weakness / resistance / retreat row. Skill text is checked against the
# official study guide; the only number on a card is the real exam weight.
#
# Card text lives here as data; the output is plain static HTML (real,
# accessible text). Re-run after editing:  python -I build-cards.py
import html, pathlib

CARDS = [
    dict(slot='red', no=2, name='Pangard', art='warden', art_y='22%', type='governance', type_name='Governance',
         evolves='Everyone Is Admin', domain='Domain 1 · Implement and manage an analytics solution',
         weight=True, palette=('#ff9b73', '#f25022', '#b8340f', '#5c1503'),
         attacks=[
             (2, 'Row-Level Lockdown', 'Row-, column-, object- and file-level security: everyone sees only what they should. Dynamic data masking hides the rest.'),
             (1, 'Ship It Safely', 'Dev → test → prod with deployment pipelines, version control and database projects.'),
         ],
         weakness='hardcoded secrets', resistance='“can I get admin?”', retreat=2,
         flavour='Nothing ships without a pipeline. Nothing opens without a role.'),
    dict(slot='green', no=3, name='Pipethon', art='pipewright', art_y='30%', type='pipeline', type_name='Pipeline',
         evolves='Cron Job', domain='Domain 2 · Ingest and transform data',
         weight=True, palette=('#c4ec6a', '#7fba00', '#558000', '#243700'),
         attacks=[
             (2, 'Incremental Load', 'Brings in only what changed. Full loads when it must, streaming loads when it can’t wait.'),
             (1, 'Late-Arriving Catch', 'Handles duplicate, missing and late-arriving data, then shapes it for a dimensional model.'),
         ],
         weakness='schema drift', resistance='messy CSVs', retreat=1,
         flavour='Full or incremental, batch or stream: the data arrives.'),
    dict(slot='blue', no=4, name='Parrquet', art='polyglot', art_y='40%', type='code', type_name='Code',
         evolves='Excel Macro', domain='Languages · PySpark, SQL and KQL',
         weight=False, palette=('#8fdcff', '#00a4ef', '#0071a8', '#002e47'),
         attacks=[
             (1, 'Right Tool', 'Picks dataflows, notebooks or T-SQL, whichever the job needs.'),
             (2, 'Triple Query', 'Transforms data with PySpark, SQL and KQL, batch or streaming.'),
         ],
         weakness='tabs vs spaces', resistance='Excel exports', retreat=3,
         flavour='Speaks PySpark, T-SQL and KQL, and knows which one the job needs.'),
    dict(slot='yellow', no=5, name='Meertric', art='watcher', art_y='0%', type='monitor', type_name='Monitor',
         evolves='print()', domain='Domain 3 · Monitor and optimize an analytics solution',
         weight=True, palette=('#ffe28a', '#ffb900', '#c98900', '#4d3300'),
         attacks=[
             (1, 'Alert Call', 'Monitors ingestion, transformation and semantic model refresh, and raises the alarm.'),
             (2, 'Tune Up', 'Resolves pipeline, notebook and T-SQL errors, then optimizes lakehouse tables, Spark and queries.'),
         ],
         weakness='silent failures', resistance='“works on my machine”', retreat=1,
         flavour='Spots the failed refresh before anyone else does.'),
]

BACK = ('<div class="card__back" aria-hidden="true"><div class="back__topo"></div><div class="back__line"></div>'
        '<div class="back__mark"><svg class="back__shield" viewBox="0 0 180 262"><use href="#crest"/></svg>'
        '<span class="back__code">DP-700</span><span class="back__series">Series 2026</span></div></div>')

e = html.escape

def icon(t, cls='type'):
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#type-{t}"/></svg>'

SITE = pathlib.Path(__file__).resolve().parents[2] / 'site'

def img(c):
    # Only reference the illustration once it exists (no 404s meanwhile;
    # the art window shows a placeholder in the type's colours).
    f = SITE / 'assets' / 'art' / f"{c['art']}.webp"
    return (f'<img src="assets/art/{c["art"]}.webp" alt="" width="1280" height="853" decoding="sync">'
            if f.exists() else '<!-- art: assets/art/' + c['art'] + '.webp (pending) -->')

def card(c):
    cid = f"c{c['no']}-title"
    light, base, dark, ink = c['palette']
    cu = ('<p class="cu" aria-label="Exam weight: 30 to 35 percent"><small>CU</small><b>30–35</b><i>%</i></p>'
          if c['weight'] else
          '<p class="cu cu--all" aria-label="Used across all 3 domains"><small>Used across</small><b>all 3 domains</b></p>')
    attacks = '\n'.join(f'''                  <li class="attack">
                    <span class="attack__cost" aria-label="Cost: {n} {c['type_name']}">{('<i class="cost">' + icon(c['type'], 'cost__glyph') + '</i>') * n}</span>
                    <strong class="attack__name">{e(name)}</strong>
                    <p class="attack__text">{e(text)}</p>
                  </li>''' for n, name, text in c['attacks'])
    cups = '<svg class="cup" viewBox="0 0 24 24"><use href="#cup"/></svg>' * c['retreat']
    return f'''        <li class="slot slot--{c['slot']}" data-slot="{c['no'] - 1}" data-face-up><div class="fly">
          <article class="card card--mon card--{c['art']}" aria-labelledby="{cid}" style="--c-light:{light};--c:{base};--c-dark:{dark};--c-ink:{ink};--art-y:{c['art_y']}">
            <div class="card__tilt tiltable">
              <div class="card__face">
                <div class="card__frame"></div>
                <div class="mon">
                  <header class="mon__head">
                    <p class="mon__stage"><span>Stage 1</span> Evolves from <em>{e(c['evolves'])}</em></p>
                    <div class="mon__title">
                      <h2 class="mon__name" id="{cid}">{e(c['name'])}</h2>
                      {cu}
                      <span class="mon__type" title="{c['type_name']} type">{icon(c['type'])}</span>
                    </div>
                  </header>
                  <div class="mon__art">
                    {img(c)}
                    <div class="foil foil--art"></div>
                    <div class="glitter"></div>
                    <div class="glare"></div>
                  </div>
                  <p class="mon__strip">{e(c['domain'])}</p>
                  <ul class="mon__attacks">
{attacks}
                  </ul>
                  <dl class="mon__stats">
                    <div><dt>weakness</dt><dd>{e(c['weakness'])}</dd></div>
                    <div><dt>resistance</dt><dd>{c['resistance']}</dd></div>
                    <div><dt>retreat</dt><dd aria-label="{c['retreat']} coffee">{cups}</dd></div>
                  </dl>
                  <p class="mon__flavour">{e(c['flavour'])}</p>
                  <footer class="mon__foot">
                    <span>Illus. Juan Mallo · Gen-AI</span>
                    <span class="mon__set"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l5 10-5 10-5-10z"/></svg>Rare · {c['no']}/5</span>
                  </footer>
                </div>
                <div class="glare glare--soft"></div>
              </div>
              {BACK}
            </div>
            <button class="card__hit" type="button" aria-expanded="false" aria-label="Zoom the card: {e(c['name'])}"></button>
          </article>
        </div></li>'''

page = SITE / 'index.html'
src = page.read_text(encoding='utf-8')
start = src.index('        <!-- 2–5 ·')
end = src.index('      </ol>', start)
block = ('        <!-- 2–5 · Colour cards (generated by tools/cards-src/build-cards.py). In the\n'
         '             2×2 grid they sit in the Microsoft logo order: red, green / blue, yellow. -->\n'
         + '\n\n'.join(card(c) for c in CARDS) + '\n')
page.write_text(src[:start] + block + src[end:], encoding='utf-8')
print('wrote', len(CARDS), 'cards')
