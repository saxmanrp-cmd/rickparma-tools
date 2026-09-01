from pathlib import Path
p=Path('fuel-tracker/tests/conversation-natural-units.test.mjs')
s=p.read_text()
s=s.replace("assert.match(coach,/pendingFood/);","assert.match(coach,/pendingFoods/);")
s=s.replace("assert.match(coach,/FuelAddCoachFood/);","assert.match(coach,/FuelAddCoachFoods/);")
s=s.replace("assert.match(coachApi,/PENDING FOOD/);","assert.match(coachApi,/PENDING FOODS/);")
s=s.replace("assert.match(wrapper,/fuel-coach\\.js\\?v=5/);","assert.match(wrapper,/fuel-coach\\.js\\?v=6/);")
p.write_text(s)
print('Updated conversation/natural-unit tests for flat food log')
