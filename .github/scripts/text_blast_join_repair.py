from pathlib import Path

path = Path('admin.html')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "    totalCount.textContent = `${subscribers.length} total`;",
    "    totalCount.textContent = `${active.length} active`;",
    'active subscriber count',
)

replace_once(
    """  function isActiveSubscriber(phone) {
    return subscribers.some(s => s.phone === phone && s.status === 'active');
  }

  function isOptedOutSubscriber(phone) {
    const s = subscribers.find(sub => sub.phone === phone);
    return !!s && (s.status === 'stopped' || s.status === 'removed');
  }
""",
    """  function normalizeSubscriberPhone(phone) {
    const digits = String(phone || '').replace(/\\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  }

  function findSubscriberByPhone(phone) {
    const key = normalizeSubscriberPhone(phone);
    if (!key) return null;
    return subscribers.find(s => normalizeSubscriberPhone(s.phone) === key) || null;
  }

  function isActiveSubscriber(phone) {
    const s = findSubscriberByPhone(phone);
    return !!s && s.status === 'active';
  }

  function isOptedOutSubscriber(phone) {
    const s = findSubscriberByPhone(phone);
    return !!s && (s.status === 'stopped' || s.status === 'removed');
  }

  // Safety net for the production SMS worker: if a recent inbound JOIN made it
  // into Messages but the subscriber record was never created, repair that
  // missing record using the same /api/subscribers/add endpoint as the admin UI.
  // Existing stopped/removed records are never silently reactivated here.
  async function repairMissingJoinSubscribers(conversations) {
    const seen = new Set();
    const missingPhones = [];

    (conversations || []).forEach(c => {
      if (!c || !c.phone || findSubscriberByPhone(c.phone)) return;
      const key = normalizeSubscriberPhone(c.phone);
      if (!key || seen.has(key)) return;
      seen.add(key);
      missingPhones.push(c.phone);
    });

    if (missingPhones.length === 0) return 0;

    const stopCommands = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let repaired = 0;

    // Cap one pass so an old inbox can never create a large request burst.
    for (const phone of missingPhones.slice(0, 50)) {
      try {
        const threadRes = await apiFetch('/api/conversations/thread?phone=' + encodeURIComponent(phone));
        if (!threadRes.ok) continue;
        const threadData = await threadRes.json();
        const messages = Array.isArray(threadData.messages) ? threadData.messages : [];

        // Threads are returned in display order. Look backward for the most
        // recent inbound subscription command so a later STOP always wins.
        const lastOptCommand = messages.slice().reverse().find(m => {
          if (!m || m.dir !== 'in') return false;
          const command = String(m.body || '').trim().toUpperCase();
          return command === 'JOIN' || stopCommands.has(command);
        });
        if (!lastOptCommand) continue;

        const command = String(lastOptCommand.body || '').trim().toUpperCase();
        if (command !== 'JOIN') continue;

        const commandAt = Date.parse(lastOptCommand.at);
        if (Number.isFinite(commandAt) && commandAt < cutoff) continue;

        const addRes = await apiFetch('/api/subscribers/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        const addData = await addRes.json();
        if (!addRes.ok || !Array.isArray(addData.subscribers)) continue;

        subscribers = addData.subscribers;
        repaired += 1;
      } catch (e) {
        // Keep inbox loading even if one repair attempt fails.
      }
    }

    if (repaired > 0) {
      renderSubscribers();
      addStatus.className = 'message-status success';
      addStatus.textContent = `Recovered ${repaired} missed JOIN opt-in${repaired === 1 ? '' : 's'}.`;
    }
    return repaired;
  }
""",
    'subscriber lookup and JOIN repair helper',
)

replace_once(
    """      const data = await res.json();
      // Hide anyone who has opted out (replied STOP) or been manually removed.
      const convos = (data.conversations || []).filter(c => !isOptedOutSubscriber(c.phone));
""",
    """      const data = await res.json();
      const rawConvos = data.conversations || [];
      await repairMissingJoinSubscribers(rawConvos);
      // Hide anyone who has opted out (replied STOP) or been manually removed.
      const convos = rawConvos.filter(c => !isOptedOutSubscriber(c.phone));
""",
    'inbox JOIN repair hook',
)

replace_once(
    "  refreshBtn.addEventListener('click', loadSubscribers);",
    """  refreshBtn.addEventListener('click', async () => {
    await loadSubscribers();
    await loadConversations();
  });""",
    'subscriber refresh JOIN repair hook',
)

path.write_text(text, encoding='utf-8')
print('Patched admin.html with missed-JOIN subscriber repair.')
