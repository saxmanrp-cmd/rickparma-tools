from pathlib import Path

root = Path('fuel-tracker')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    return text.replace(old, new, 1)

p = root / 'tests/conversation-natural-units.test.mjs'
s = p.read_text()
s = replace_once(s, r"assert.match(wrapper,/fuel-coach\.js\?v=6/);", r"assert.match(wrapper,/fuel-coach\.js\?v=7/);", 'conversation coach cache test')
p.write_text(s)

p = root / 'tests/smoke.test.mjs'
s = p.read_text()
s = replace_once(s, r"assert.match(coachApi,/max_output_tokens:notification\?180:650/);", r"assert.match(coachApi,/max_output_tokens:notification\?180:900/);", 'coach token test')
s = replace_once(s, r"assert.match(client,/draft\.items\.length>1\?'Save foods':'Save food'/);", "assert.match(client,/Log individually/);\n  assert.match(client,/Log as meal/);", 'flat food button test')
p.write_text(s)

print('Fuel meal mode stale tests updated')
