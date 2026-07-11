/* ═══════════════════════════════════════════════════════════════
   OrgDesigner – Single-file application script
   No ES modules – runs directly from file:// protocol
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // SECTION 1: Helpers
  // ─────────────────────────────────────────────

  function uid() {
    return 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function el(tag, attrs) {
    var children = Array.prototype.slice.call(arguments, 2);
    var element = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (k === 'className') {
          element.className = v;
        } else if (k === 'dataset') {
          Object.assign(element.dataset, v);
        } else if (k.startsWith('on') && typeof v === 'function') {
          element.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          element.setAttribute(k, v);
        }
      });
    }
    children.forEach(function (child) {
      if (child == null) return;
      if (typeof child === 'string' || typeof child === 'number') {
        element.appendChild(document.createTextNode(String(child)));
      } else {
        element.appendChild(child);
      }
    });
    return element;
  }

  function debounce(fn, ms) {
    var timer;
    ms = ms || 200;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  var RANK_ORDER = ['MD', 'ED', 'DI', 'AD', 'AO', 'EE', 'IV', 'NA'];

  function rankColor(rankCode) {
    var code = (rankCode || '').toUpperCase().trim();
    var map = {
      'MD': '#7B0000', // Deep Burgundy
      'ED': '#B80000', // Dark Crimson
      'DI': '#EC0000', // Signature UBS Red
      'AD': '#FF6B6B', // Coral / Light Red
      'AO': '#1A3B66', // Deep Corporate Navy
      'EE': '#3B6290', // Steel Blue
      'IV': '#7C95B3', // Muted Ice Blue
      'NA': '#9EADB8'  // Soft Slate Gray
    };
    if (map[code]) return map[code];
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      if (code.startsWith(keys[i])) return map[keys[i]];
    }
    return '#9EADB8';
  }

  function initials(first, last) {
    return ((first ? first[0] : '') + (last ? last[0] : '')).toUpperCase();
  }

  function escapeHtml(str) {
    return str || '';
  }

  function showToast(msg) {
    var toast = el('div', { className: 'toast' }, msg);
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('toast--visible'); });
    setTimeout(function () {
      toast.classList.remove('toast--visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
  }

  // ─────────────────────────────────────────────
  // SECTION 2: State Management
  // ─────────────────────────────────────────────

  var _listeners = {};

  var state = {
    allPersonnel: [],
    pages: [],
    activePageId: null,
    limitColWidth: false,
    maxColWidth: 260
  };

  function saveState() {
    try {
      localStorage.setItem('org_designer_state', JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }

  function loadState() {
    try {
      var saved = localStorage.getItem('org_designer_state');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.pages)) {
          state.allPersonnel = parsed.allPersonnel || [];
          state.pages = parsed.pages;
          state.activePageId = parsed.activePageId;
          state.limitColWidth = parsed.limitColWidth || false;
          state.maxColWidth = parsed.maxColWidth || 260;
        }
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }

  function normaliseWorkspaceState() {
    if (!state.pages) return;
    state.pages.forEach(function (page) {
      if (!page.transversals) return;
      page.transversals.forEach(function (tv) {
        if (!tv.leads || !Array.isArray(tv.leads)) {
          tv.leads = tv.lead ? [tv.lead] : [];
        }
        tv.lead = tv.leads[0] || null;
      });
    });
  }

  loadState();
  normaliseWorkspaceState();

  function on(channel, fn) {
    if (!_listeners[channel]) _listeners[channel] = [];
    _listeners[channel].push(fn);
  }

  function emit() {
    var channels = Array.from(arguments);
    var fired = new Set();
    channels.forEach(function (ch) {
      if (_listeners[ch]) {
        _listeners[ch].forEach(function (fn) {
          if (!fired.has(fn)) { fired.add(fn); fn(); }
        });
      }
    });
    if (_listeners['*']) {
      _listeners['*'].forEach(function (fn) {
        if (!fired.has(fn)) { fired.add(fn); fn(); }
      });
    }
    saveState();
  }

  // ── Page Helpers ──

  function getActivePage() {
    return state.pages.find(function (p) { return p.id === state.activePageId; }) || null;
  }

  function getPersonByGPN(gpn) {
    for (var i = 0; i < state.allPersonnel.length; i++) {
      if (state.allPersonnel[i].GPN === gpn) return state.allPersonnel[i];
    }
    return null;
  }

  function countAssignments(gpn) {
    var count = 0;
    state.pages.forEach(function (page) {
      page.teams.forEach(function (team) {
        if (team.memberGPNs.indexOf(gpn) !== -1) count++;
      });
    });
    return count;
  }

  function resolveMembers(team) {
    return team.memberGPNs
      .map(function (gpn) { return getPersonByGPN(gpn); })
      .filter(Boolean);
  }

  // ── Movement Functions ──

  function findPersonByGPN(gpn) {
    var person = getPersonByGPN(gpn);
    if (!person) return null;

    var page = getActivePage();
    if (!page) return { person: person, location: 'pool' };

    for (var i = 0; i < page.teams.length; i++) {
      var team = page.teams[i];
      if (team.memberGPNs.indexOf(gpn) !== -1) {
        return { person: person, location: 'team', teamId: team.id };
      }
    }

    for (var j = 0; j < page.transversals.length; j++) {
      var tv = page.transversals[j];
      var leads = tv.leads || (tv.lead ? [tv.lead] : []);
      if (leads.indexOf(gpn) !== -1) {
        return { person: person, location: 'transversal-lead', transversalId: tv.id };
      }
    }

    return { person: person, location: 'pool' };
  }

  function allPeople() {
    return state.allPersonnel.slice();
  }

  function lookupAll(gpn) {
    return getPersonByGPN(gpn);
  }

  function removeFromTeam(gpn, teamId) {
    var page = getActivePage();
    if (!page) return;
    var team = page.teams.find(function (t) { return t.id === teamId; });
    if (!team) return;
    var idx = team.memberGPNs.indexOf(gpn);
    if (idx !== -1) team.memberGPNs.splice(idx, 1);
    if (team.lead === gpn) team.lead = null;
  }

  function moveToPool(gpn) {
    // Remove from whichever team on the active page the drag originated from
    var page = getActivePage();
    if (page) {
      page.teams.forEach(function (team) {
        var idx = team.memberGPNs.indexOf(gpn);
        if (idx !== -1) {
          team.memberGPNs.splice(idx, 1);
          if (team.lead === gpn) team.lead = null;
        }
      });
      page.transversals.forEach(function (tv) {
        if (tv.leads) {
          var idx = tv.leads.indexOf(gpn);
          if (idx !== -1) tv.leads.splice(idx, 1);
        }
        if (tv.lead === gpn) tv.lead = tv.leads ? (tv.leads[0] || null) : null;
      });
    }
    emit('pool', 'teams', 'transversals');
  }

  function moveToTeam(gpn, teamId) {
    var person = getPersonByGPN(gpn);
    if (!person) return;
    var page = getActivePage();
    if (!page) return;
    var team = page.teams.find(function (t) { return t.id === teamId; });
    if (!team) return;
    // Add if not already a member
    if (team.memberGPNs.indexOf(gpn) === -1) {
      team.memberGPNs.push(gpn);
    }
    emit('pool', 'teams', 'transversals');
  }

  function setTransversalLead(gpn, transversalId) {
    var page = getActivePage();
    if (!page) return;

    normaliseWorkspaceState();

    var tv = page.transversals.find(function (t) { return t.id === transversalId; });
    if (!tv) return;


    if (tv.leads.indexOf(gpn) === -1) {
      tv.leads.push(gpn);
    }
    tv.lead = tv.leads[0] || null;

    emit('transversals', 'teams', 'pool');
  }

  function removeTransversalLead(gpn, tvId) {
    var page = getActivePage();
    if (!page) return;

    normaliseWorkspaceState();

    var tv = page.transversals.find(function (t) { return t.id === tvId; });
    if (!tv) return;

    if (tv.leads) {
      var idx = tv.leads.indexOf(gpn);
      if (idx !== -1) {
        tv.leads.splice(idx, 1);
        tv.lead = tv.leads[0] || null;
        emit('transversals', 'teams', 'pool');
      }
    }
  }

  function setTeamLead(gpn, teamId) {
    var page = getActivePage();
    if (!page) return;
    var team = page.teams.find(function (t) { return t.id === teamId; });
    if (!team) return;
    // Ensure the person is in the team first
    if (team.memberGPNs.indexOf(gpn) === -1) {
      team.memberGPNs.push(gpn);
    }
    team.lead = gpn;
    emit('teams');
  }

  // ─────────────────────────────────────────────
  // SECTION 3: Importer
  // ─────────────────────────────────────────────

  var REQUIRED_FIELDS = ['GPN', 'Last Name', 'First Name'];

  function normalisePerson(raw) {
    var rawRank = String(raw['Rank Code'] || raw['rank_code'] || '').trim().toUpperCase();
    var legacyMap = {
      'SVP': 'ED',
      'VP': 'ED',
      'DIR': 'DI',
      'MGR': 'AD',
      'SR': 'AO',
      'JR': 'EE',
      'INT': 'IV'
    };
    var rank = legacyMap[rawRank] || rawRank;
    if (!rank) {
      rank = 'NA';
    }

    return {
      GPN: String(raw['GPN'] || raw['gpn'] || ''),
      'Last Name': raw['Last Name'] || raw['last_name'] || '',
      'First Name': raw['First Name'] || raw['first_name'] || '',
      'Rank Code': rank,
      'Evaluating Manager': raw['Evaluating Manager'] || raw['evaluating_manager'] || '',
      'Physical Location City': raw['Physical Location City'] || raw['city'] || '',
      'Physical Location Country': raw['Physical Location Country'] || raw['country'] || '',
      'Physical Location Region': raw['Physical Location Region'] || raw['region'] || '',
      'Role Name': raw['Role Name'] || raw['role_name'] || raw['Role State'] || raw['role_state'] || '',
      'Current Allocation': raw['Current Allocation'] || raw['current_allocation'] || '',
      'New Allocation': raw['New Allocation'] || raw['new_allocation'] || '',
      'Comment': raw['Comment'] || raw['comment'] || '',
    };
  }

  function importJSON(file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var raw = JSON.parse(e.target.result);
        if (!Array.isArray(raw)) {
          callback({ ok: false, errors: ['JSON root must be an array of personnel objects.'] });
          return;
        }

        var errors = [];
        var people = [];

        raw.forEach(function (record, i) {
          var normalised = normalisePerson(record);
          var missing = REQUIRED_FIELDS.filter(function (f) { return !normalised[f]; });
          if (missing.length) {
            errors.push('Record #' + (i + 1) + ': missing ' + missing.join(', '));
          } else if (people.some(function (p) { return p.GPN === normalised.GPN; })) {
            errors.push('Record #' + (i + 1) + ': duplicate GPN "' + normalised.GPN + '"');
          } else {
            people.push(normalised);
          }
        });

        if (errors.length && people.length === 0) {
          callback({ ok: false, errors: errors });
          return;
        }

        // Append to master registry
        state.allPersonnel = state.allPersonnel.concat(people);
        emit('pool');
        callback({ ok: true, count: people.length, errors: errors.length ? errors : null });
      } catch (parseErr) {
        callback({ ok: false, errors: ['Invalid JSON: ' + parseErr.message] });
      }
    };
    reader.onerror = function () { callback({ ok: false, errors: ['Failed to read file.'] }); };
    reader.readAsText(file);
  }

  function exportWorkspace() {
    try {
      var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
      var dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute("href",     dataStr     );
      dlAnchorElem.setAttribute("download", "org-workspace-export.json");
      dlAnchorElem.click();
      showToast("Workspace exported");
    } catch (err) {
      showToast("Export failed: " + err.message);
    }
  }

  function importWorkspace(file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        if (!parsed || !Array.isArray(parsed.pages) || !Array.isArray(parsed.allPersonnel)) {
          callback({ ok: false, error: 'Invalid workspace export file structure.' });
          return;
        }

        state.allPersonnel = parsed.allPersonnel;
        state.pages = parsed.pages;
        state.activePageId = parsed.activePageId;
        normaliseWorkspaceState();

        // Force redraw
        emit('pool', 'pages', 'teams', 'transversals');
        callback({ ok: true });
      } catch (parseErr) {
        callback({ ok: false, error: 'Invalid JSON: ' + parseErr.message });
      }
    };
    reader.onerror = function () { callback({ ok: false, error: 'Failed to read file.' }); };
    reader.readAsText(file);
  }

  function resetWorkspace() {
    if (confirm('Start a new workspace? This will permanently delete all current pages, teams, layers, and personnel from browser storage.')) {
      state.allPersonnel = [];
      state.pages = [];
      state.activePageId = null;
      localStorage.removeItem('org_designer_state');
      emit('pool', 'pages', 'teams', 'transversals');
      showToast('Workspace reset');
    }
  }

  // ─────────────────────────────────────────────
  // SECTION 4: Drag & Drop Engine
  // ─────────────────────────────────────────────

  function makeDraggable(cardEl, gpn, source) {
    cardEl.setAttribute('draggable', 'true');
    cardEl.addEventListener('dragstart', function (e) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', gpn);
      e.dataTransfer.setData('application/x-source', source);
      cardEl.classList.add('dragging');
      requestAnimationFrame(function () {
        $$('.drop-zone').forEach(function (z) { z.classList.add('drop-zone--active'); });
      });
    });
    cardEl.addEventListener('dragend', function () {
      cardEl.classList.remove('dragging');
      $$('.drop-zone').forEach(function (z) {
        z.classList.remove('drop-zone--active', 'drop-zone--over');
      });
    });
  }

  function makeDropZone(zoneEl, type, targetId) {
    zoneEl.classList.add('drop-zone');

    zoneEl.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zoneEl.classList.add('drop-zone--over');
    });

    zoneEl.addEventListener('dragleave', function (e) {
      if (!zoneEl.contains(e.relatedTarget)) {
        zoneEl.classList.remove('drop-zone--over');
      }
    });

    zoneEl.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.remove('drop-zone--over');

      var gpn = e.dataTransfer.getData('text/plain');
      if (!gpn) return;

      switch (type) {
        case 'pool':
          moveToPool(gpn);
          break;
        case 'team':
          moveToTeam(gpn, targetId);
          break;
        case 'team-lead':
          moveToTeam(gpn, targetId);
          setTeamLead(gpn, targetId);
          break;
        case 'transversal-lead':
          setTransversalLead(gpn, targetId);
          break;
      }
    });
  }

  // ─────────────────────────────────────────────
  // SECTION 5: Auto-Sorting Algorithm
  // ─────────────────────────────────────────────

  function computeTeamOrder() {
    var page = getActivePage();
    if (!page || page.teams.length === 0) return [];

    var teamIds = page.teams.map(function (t) { return t.id; });

    // Map team ID to its set of transversal IDs
    var teamTvs = {};
    teamIds.forEach(function (tid) {
      teamTvs[tid] = [];
    });
    page.transversals.forEach(function (tv) {
      tv.targetTeamIds.forEach(function (tid) {
        if (teamTvs[tid]) {
          teamTvs[tid].push(tv.id);
        }
      });
    });

    // Similarity score between tid1 and tid2
    function getSimilarity(tid1, tid2) {
      var tvs1 = teamTvs[tid1] || [];
      var tvs2 = teamTvs[tid2] || [];
      var intersection = tvs1.filter(function (x) { return tvs2.indexOf(x) !== -1; });
      return intersection.length;
    }

    var remaining = teamIds.slice();
    var ordered = [];

    // Start with the team that has the most connections to break ties
    remaining.sort(function (a, b) {
      return teamTvs[b].length - teamTvs[a].length;
    });

    if (remaining.length > 0) {
      var current = remaining.shift();
      ordered.push(current);

      while (remaining.length > 0) {
        var bestIdx = 0;
        var bestScore = -1;

        for (var i = 0; i < remaining.length; i++) {
          var score = getSimilarity(current, remaining[i]);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        current = remaining.splice(bestIdx, 1)[0];
        ordered.push(current);
      }
    }

    return ordered;
  }

  function getTransversalSpan(transversal, orderedTeamIds) {
    var positions = transversal.targetTeamIds
      .map(function (id) { return orderedTeamIds.indexOf(id); })
      .filter(function (i) { return i !== -1; });
    if (positions.length === 0) return null;
    return { start: Math.min.apply(null, positions), end: Math.max.apply(null, positions) };
  }

  // ─────────────────────────────────────────────
  // SECTION 6: Pool (Personnel Registry)
  // ─────────────────────────────────────────────

  var _filterText = '';
  var _filterHideAssigned = true; // Default hide assigned is true
  var _filterNamesOnly = false;

  // Popover filter selections
  var _popoverFilters = {
    rank: '',
    region: '',
    manager: '',
    city: '',
    country: '',
    currentAlloc: '',
    newAlloc: ''
  };

  function openPersonnelOverviewModal() {
    var prev = $('#personnel-overview-modal');
    if (prev) prev.remove();

    var overlay = el('div', { className: 'modal-overlay', id: 'personnel-overview-modal' });

    var searchInput = el('input', {
      type: 'search',
      className: 'form-input',
      placeholder: 'Search name, GPN, rank, city...',
      value: _filterText,
      style: 'grid-column: span 2;'
    });

    var hideAssignedCheckbox = el('input', {
      type: 'checkbox',
      checked: _filterHideAssigned
    });

    var hideAssignedLabel = el('label', {
      style: 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.85rem; color: var(--text-primary); user-select: none; margin: 0;'
    }, hideAssignedCheckbox, el('span', {}, 'Hide Assigned'));

    // Dropdown filters
    var rankSelect = el('select', { className: 'form-input' });
    var regionSelect = el('select', { className: 'form-input' });
    var managerSelect = el('select', { className: 'form-input' });
    var citySelect = el('select', { className: 'form-input' });
    var countrySelect = el('select', { className: 'form-input' });
    var currentAllocSelect = el('select', { className: 'form-input' });
    var newAllocSelect = el('select', { className: 'form-input' });

    function populateSelect(selectEl, fieldName, emptyLabel, currentVal) {
      var uniqueSet = {};
      state.allPersonnel.forEach(function (p) {
        var val = p[fieldName];
        if (val) uniqueSet[val] = true;
      });
      var sortedList = Object.keys(uniqueSet).sort(function (a, b) {
        if (fieldName === 'Rank Code') {
          var idxA = RANK_ORDER.indexOf(a);
          var idxB = RANK_ORDER.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
        }
        return a.localeCompare(b);
      });
      selectEl.innerHTML = '<option value="">' + emptyLabel + '</option>';
      sortedList.forEach(function (val) {
        var opt = el('option', { value: val }, val);
        if (val === currentVal) opt.selected = true;
        selectEl.appendChild(opt);
      });
    }

    function populateAllSelects() {
      populateSelect(rankSelect, 'Rank Code', 'All Ranks', _popoverFilters.rank);
      populateSelect(regionSelect, 'Physical Location Region', 'All Regions', _popoverFilters.region);
      populateSelect(managerSelect, 'Evaluating Manager', 'All Managers', _popoverFilters.manager);
      populateSelect(citySelect, 'Physical Location City', 'All Cities', _popoverFilters.city);
      populateSelect(countrySelect, 'Physical Location Country', 'All Countries', _popoverFilters.country);
      populateSelect(currentAllocSelect, 'Current Allocation', 'All Current Alloc', _popoverFilters.currentAlloc);
      populateSelect(newAllocSelect, 'New Allocation', 'All New Alloc', _popoverFilters.newAlloc);
    }

    populateAllSelects();

    var resetBtn = el('button', {
      type: 'button',
      className: 'btn btn--ghost btn--sm',
      style: 'margin-left: auto;',
      onClick: function () {
        _filterText = '';
        _filterHideAssigned = false;
        Object.keys(_popoverFilters).forEach(function (k) { _popoverFilters[k] = ''; });

        // Update inputs
        searchInput.value = '';
        hideAssignedCheckbox.checked = false;
        var sbSearch = $('#pool-search');
        if (sbSearch) sbSearch.value = '';
        var sbCb = $('#pool-hide-assigned');
        if (sbCb) sbCb.checked = false;

        populateAllSelects();
        renderPool();
        renderOverviewList();
      }
    }, 'Reset Filters');

    var filterSection = el('div', { className: 'overview-filters-grid' },
      searchInput,
      el('div', { style: 'display: flex; align-items: center; justify-content: flex-start;' }, hideAssignedLabel),
      rankSelect,
      regionSelect,
      managerSelect,
      citySelect,
      countrySelect,
      currentAllocSelect,
      newAllocSelect,
      el('div', { style: 'display: flex; align-items: center; grid-column: span 2;' }, resetBtn)
    );

    var countLabel = el('div', { style: 'font-weight: 600; font-size: 0.9rem; color: var(--text-secondary); margin-bottom: var(--space-xs);' });
    var overviewGrid = el('div', { className: 'overview-grid' });
    var listContainer = el('div', { className: 'overview-list-container' }, overviewGrid);

    function renderOverviewList() {
      var people = state.allPersonnel.slice();

      // 1) Hide assigned filter
      if (_filterHideAssigned) {
        people = people.filter(function (p) { return countAssignments(p.GPN) === 0; });
      }

      // 2) Text search filter
      if (_filterText) {
        var query = _filterText.toLowerCase();
        people = people.filter(function (p) {
          return p['First Name'].toLowerCase().indexOf(query) !== -1 ||
            p['Last Name'].toLowerCase().indexOf(query) !== -1 ||
            p.GPN.toLowerCase().indexOf(query) !== -1 ||
            (p['Rank Code'] || '').toLowerCase().indexOf(query) !== -1 ||
            (p['Physical Location City'] || '').toLowerCase().indexOf(query) !== -1;
        });
      }

      // 3) Popover filters
      if (_popoverFilters.rank) {
        people = people.filter(function (p) { return p['Rank Code'] === _popoverFilters.rank; });
      }
      if (_popoverFilters.region) {
        people = people.filter(function (p) { return p['Physical Location Region'] === _popoverFilters.region; });
      }
      if (_popoverFilters.manager) {
        people = people.filter(function (p) { return p['Evaluating Manager'] === _popoverFilters.manager; });
      }
      if (_popoverFilters.city) {
        people = people.filter(function (p) { return p['Physical Location City'] === _popoverFilters.city; });
      }
      if (_popoverFilters.country) {
        people = people.filter(function (p) { return p['Physical Location Country'] === _popoverFilters.country; });
      }
      if (_popoverFilters.currentAlloc) {
        people = people.filter(function (p) { return p['Current Allocation'] === _popoverFilters.currentAlloc; });
      }
      if (_popoverFilters.newAlloc) {
        people = people.filter(function (p) { return p['New Allocation'] === _popoverFilters.newAlloc; });
      }

      countLabel.textContent = 'Showing ' + people.length + ' of ' + state.allPersonnel.length + ' personnel';
      overviewGrid.innerHTML = '';

      if (people.length === 0) {
        overviewGrid.appendChild(el('div', { style: 'grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: var(--space-xl) 0;' }, 'No personnel found matching active filters'));
        return;
      }

      people.forEach(function (person) {
        var rc = rankColor(person['Rank Code']);
        var assignCount = countAssignments(person.GPN);
        var city = person['Physical Location City'] || '';
        var country = person['Physical Location Country'] || '';
        var location = [city, country].filter(Boolean).join(', ');

        var card = el('div', { className: 'overview-card' },
          el('div', { style: 'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px; margin-bottom: 4px;' },
            el('div', { style: 'display: flex; align-items: center; gap: var(--space-sm);' },
              el('span', { className: 'person-card__rank', style: 'border-color:' + rc + ';color:' + rc }, person['Rank Code'] || 'NA'),
              el('strong', { style: 'font-size: 1rem; color: var(--text-primary);' }, person['First Name'] + ' ' + person['Last Name']),
              el('span', { style: 'color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-mono);' }, person.GPN)
            ),
            el('div', { style: 'display: flex; align-items: center; gap: var(--space-xs);' },
              el('span', { style: 'font-size: 0.8rem; background: var(--bg-base); padding: 2px 6px; border-radius: var(--radius-sm); color: var(--text-secondary); font-weight: 600;' },
                assignCount > 0 ? 'Assigned ×' + assignCount : 'Unassigned'
              ),
              el('button', {
                className: 'btn-icon',
                style: 'padding: 2px; width: 22px; height: 22px; font-size: 0.8rem; display: flex; align-items: center; justify-content: center;',
                title: 'Edit Personnel Info',
                onClick: function () {
                  openAddPersonModal(person.GPN);
                }
              }, '✏️')
            )
          ),
          el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-xs) var(--space-sm); font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;' },
            el('div', {},
              el('div', {}, el('strong', {}, 'Role: '), escapeHtml(person['Role Name'] || '—')),
              el('div', {}, el('strong', {}, 'Manager: '), escapeHtml(person['Evaluating Manager'] || '—')),
              el('div', {}, el('strong', {}, 'Location: '), escapeHtml(location || '—'))
            ),
            el('div', {},
              el('div', {}, el('strong', {}, 'Region: '), escapeHtml(person['Physical Location Region'] || '—')),
              el('div', {}, el('strong', {}, 'Current Alloc: '), escapeHtml(person['Current Allocation'] || '100%')),
              el('div', {}, el('strong', {}, 'New Alloc: '), escapeHtml(person['New Allocation'] || '—'))
            )
          ),
          person['Comment'] ? el('div', { style: 'font-size: 0.82rem; padding: var(--space-xs) var(--space-sm); background: #fafafc; border-left: 3px solid var(--border-medium); margin-top: 4px; color: var(--text-secondary); font-style: italic; border-radius: var(--radius-sm); word-break: break-word;' },
            el('strong', { style: 'font-style: normal; color: var(--text-primary);' }, 'Notes: '), escapeHtml(person['Comment'])
          ) : null
        );
        overviewGrid.appendChild(card);
      });
    }

    // Attach listeners
    searchInput.addEventListener('input', function () {
      _filterText = searchInput.value;
      var sbSearch = $('#pool-search');
      if (sbSearch) sbSearch.value = _filterText;
      renderPool();
      renderOverviewList();
    });

    hideAssignedCheckbox.addEventListener('change', function () {
      _filterHideAssigned = hideAssignedCheckbox.checked;
      var sbCb = $('#pool-hide-assigned');
      if (sbCb) sbCb.checked = _filterHideAssigned;
      renderPool();
      renderOverviewList();
    });

    var dropdowns = [
      { el: rankSelect, key: 'rank' },
      { el: regionSelect, key: 'region' },
      { el: managerSelect, key: 'manager' },
      { el: citySelect, key: 'city' },
      { el: countrySelect, key: 'country' },
      { el: currentAllocSelect, key: 'currentAlloc' },
      { el: newAllocSelect, key: 'newAlloc' }
    ];

    dropdowns.forEach(function (dd) {
      dd.el.addEventListener('change', function () {
        _popoverFilters[dd.key] = dd.el.value;
        renderPool();
        renderOverviewList();
      });
    });

    renderOverviewList();

    var modal = el('div', { className: 'modal modal--wide', id: 'personnel-overview-modal' },
      el('div', { className: 'modal__header' },
        el('h3', {}, 'Personnel Directory & Overview'),
        el('button', {
          className: 'modal__close', type: 'button',
          onClick: function () { overlay.remove(); }
        }, '✕')
      ),
      el('div', { className: 'modal__body', style: 'display: flex; flex-direction: column; gap: var(--space-xs); height: 70vh;' },
        filterSection,
        countLabel,
        listContainer
      )
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { searchInput.focus(); });
  }

  function openAddPersonModal(existingGpn) {
    var prev = $('#add-person-modal');
    if (prev) prev.remove();

    var existing = existingGpn
      ? state.allPersonnel.find(function (p) { return p.GPN === existingGpn; })
      : null;

    var overlay = el('div', { className: 'modal-overlay', id: 'add-person-modal' });

    var gpnInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'e.g. GPN101',
      required: true,
      value: existing ? existing.GPN : ''
    });
    if (existing) {
      gpnInput.disabled = true;
    }

    var firstNameInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'First Name',
      required: true,
      value: existing ? existing['First Name'] : ''
    });
    var lastNameInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'Last Name',
      required: true,
      value: existing ? existing['Last Name'] : ''
    });
    
    var rankSelect = el('select', { className: 'form-input' },
      el('option', { value: 'MD' }, 'Managing Director (MD)'),
      el('option', { value: 'ED' }, 'Executive Director (ED)'),
      el('option', { value: 'DI' }, 'Director (DI)'),
      el('option', { value: 'AD' }, 'Associate Director (AD)'),
      el('option', { value: 'AO' }, 'Authorized Officer (AO)'),
      el('option', { value: 'EE' }, 'Employee (EE)'),
      el('option', { value: 'IV' }, 'Intern (IV)'),
      el('option', { value: 'NA' }, 'Not Applicable (NA)')
    );
    if (existing) {
      rankSelect.value = existing['Rank Code'] || 'NA';
    }

    var managerInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'Manager GPN (optional)',
      value: existing ? existing['Evaluating Manager'] : ''
    });
    var cityInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'City',
      value: existing ? existing['Physical Location City'] : ''
    });
    var countryInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'Country',
      value: existing ? existing['Physical Location Country'] : ''
    });
    
    var regionSelect = el('select', { className: 'form-input' },
      el('option', { value: 'EMEA' }, 'EMEA'),
      el('option', { value: 'APAC' }, 'APAC'),
      el('option', { value: 'Americas' }, 'Americas')
    );
    if (existing) {
      regionSelect.value = existing['Physical Location Region'] || 'EMEA';
    }

    var roleInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'e.g. Lead Engineer, Product Owner...',
      value: existing ? existing['Role Name'] : ''
    });

    var currentAllocInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'e.g. 100%',
      value: existing ? existing['Current Allocation'] : ''
    });
    var newAllocInput = el('input', {
      type: 'text',
      className: 'form-input',
      placeholder: 'e.g. 100%',
      value: existing ? existing['New Allocation'] : ''
    });
    var commentTextarea = el('textarea', {
      className: 'form-input form-textarea',
      placeholder: 'Notes...',
    }, existing ? existing['Comment'] : '');

    var formEl = el('form', { className: 'modal__body', style: 'max-height: 70vh; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-xs);' },
      el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm);' },
        el('div', {}, el('label', { className: 'form-label' }, 'First Name *'), firstNameInput),
        el('div', {}, el('label', { className: 'form-label' }, 'Last Name *'), lastNameInput)
      ),
      el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm);' },
        el('div', {}, el('label', { className: 'form-label' }, 'GPN *'), gpnInput),
        el('div', {}, el('label', { className: 'form-label' }, 'Rank'), rankSelect)
      ),
      el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm);' },
        el('div', {}, el('label', { className: 'form-label' }, 'Evaluating Manager'), managerInput),
        el('div', {}, el('label', { className: 'form-label' }, 'Role Name'), roleInput)
      ),
      el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-sm);' },
        el('div', {}, el('label', { className: 'form-label' }, 'City'), cityInput),
        el('div', {}, el('label', { className: 'form-label' }, 'Country'), countryInput),
        el('div', {}, el('label', { className: 'form-label' }, 'Region'), regionSelect)
      ),
      el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm);' },
        el('div', {}, el('label', { className: 'form-label' }, 'Current Allocation'), currentAllocInput),
        el('div', {}, el('label', { className: 'form-label' }, 'New Allocation'), newAllocInput)
      ),
      el('label', { className: 'form-label' }, 'Comment'),
      commentTextarea,
      el('div', { className: 'modal__actions', style: 'margin-top: var(--space-md);' },
        el('button', { type: 'button', className: 'btn btn--ghost', onClick: function () { overlay.remove(); } }, 'Cancel'),
        el('button', { type: 'submit', className: 'btn btn--primary' }, 'Save')
      )
    );

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var gpn = gpnInput.value.trim().toUpperCase();
      var first = firstNameInput.value.trim();
      var last = lastNameInput.value.trim();

      if (!gpn || !first || !last) return;

      if (existing) {
        existing['First Name'] = first;
        existing['Last Name'] = last;
        existing['Rank Code'] = rankSelect.value;
        existing['Evaluating Manager'] = managerInput.value.trim().toUpperCase();
        existing['Physical Location City'] = cityInput.value.trim();
        existing['Physical Location Country'] = countryInput.value.trim();
        existing['Physical Location Region'] = regionSelect.value;
        existing['Role Name'] = roleInput.value.trim();
        existing['Current Allocation'] = currentAllocInput.value.trim() || '100%';
        existing['New Allocation'] = newAllocInput.value.trim();
        existing['Comment'] = commentTextarea.value.trim();
        showToast(first + ' ' + last + ' updated');
      } else {
        if (state.allPersonnel.some(function (p) { return p.GPN === gpn; })) {
          alert('Duplicate GPN "' + gpn + '". Personnel already exists.');
          gpnInput.focus();
          return;
        }

        var person = {
          'GPN': gpn,
          'First Name': first,
          'Last Name': last,
          'Rank Code': rankSelect.value,
          'Evaluating Manager': managerInput.value.trim().toUpperCase(),
          'Physical Location City': cityInput.value.trim(),
          'Physical Location Country': countryInput.value.trim(),
          'Physical Location Region': regionSelect.value,
          'Role Name': roleInput.value.trim(),
          'Current Allocation': currentAllocInput.value.trim() || '100%',
          'New Allocation': newAllocInput.value.trim(),
          'Comment': commentTextarea.value.trim()
        };

        state.allPersonnel.push(person);
        showToast(first + ' ' + last + ' added');
      }

      emit('pool', 'teams', 'transversals');
      overlay.remove();

      var overviewModal = $('#personnel-overview-modal');
      if (overviewModal) {
        openPersonnelOverviewModal();
      }
    });

    var modal = el('div', { className: 'modal', style: 'max-width: 500px;' },
      el('div', { className: 'modal__header' },
        el('h3', {}, existing ? 'Edit Person Info' : 'Add Person Manually'),
        el('button', {
          className: 'modal__close', type: 'button',
          onClick: function () { overlay.remove(); }
        }, '✕')
      ),
      formEl
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { (existing ? firstNameInput : gpnInput).focus(); });
  }

  function initPool() {
    var container = $('#pool-container');
    if (!container) return;

    makeDropZone(container, 'pool');

    var searchInput = $('#pool-search');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(function (e) {
        _filterText = e.target.value.toLowerCase();
        renderPool();
      }, 150));
    }

    var hideAssignedCb = $('#pool-hide-assigned');
    if (hideAssignedCb) {
      hideAssignedCb.checked = _filterHideAssigned;
      hideAssignedCb.addEventListener('change', function (e) {
        _filterHideAssigned = e.target.checked;
        renderPool();
      });
    }

    var namesOnlyCb = $('#pool-names-only');
    if (namesOnlyCb) {
      namesOnlyCb.checked = _filterNamesOnly;
      namesOnlyCb.addEventListener('change', function (e) {
        _filterNamesOnly = e.target.checked;
        var ws = $('#org-workspace');
        if (ws) ws.classList.toggle('names-only-active', _filterNamesOnly);
      });
    }

    var addPersonBtn = $('#add-person-btn');
    if (addPersonBtn) {
      addPersonBtn.addEventListener('click', openAddPersonModal);
    }

    // Overview & Filter Modal Trigger
    var popoverBtn = $('#filter-popover-btn');
    if (popoverBtn) {
      popoverBtn.addEventListener('click', openPersonnelOverviewModal);
    }

    on('pool', function () {
      renderPool();
    });
    on('teams', renderPool);
    renderPool();
  }

  function renderPool() {
    var list = $('#pool-list');
    if (!list) return;

    var countEl = $('#pool-count');
    var people = state.allPersonnel.slice();

    // 1) Hide assigned filter
    if (_filterHideAssigned) {
      people = people.filter(function (p) { return countAssignments(p.GPN) === 0; });
    }

    // 2) Text search filter
    if (_filterText) {
      people = people.filter(function (p) {
        return p['First Name'].toLowerCase().indexOf(_filterText) !== -1 ||
          p['Last Name'].toLowerCase().indexOf(_filterText) !== -1 ||
          p.GPN.toLowerCase().indexOf(_filterText) !== -1 ||
          (p['Rank Code'] || '').toLowerCase().indexOf(_filterText) !== -1 ||
          (p['Physical Location City'] || '').toLowerCase().indexOf(_filterText) !== -1;
      });
    }

    // 3) Popover filters
    if (_popoverFilters.rank) {
      people = people.filter(function (p) { return p['Rank Code'] === _popoverFilters.rank; });
    }
    if (_popoverFilters.region) {
      people = people.filter(function (p) { return p['Physical Location Region'] === _popoverFilters.region; });
    }
    if (_popoverFilters.manager) {
      people = people.filter(function (p) { return p['Evaluating Manager'] === _popoverFilters.manager; });
    }
    if (_popoverFilters.city) {
      people = people.filter(function (p) { return p['Physical Location City'] === _popoverFilters.city; });
    }
    if (_popoverFilters.country) {
      people = people.filter(function (p) { return p['Physical Location Country'] === _popoverFilters.country; });
    }
    if (_popoverFilters.currentAlloc) {
      people = people.filter(function (p) { return p['Current Allocation'] === _popoverFilters.currentAlloc; });
    }
    if (_popoverFilters.newAlloc) {
      people = people.filter(function (p) { return p['New Allocation'] === _popoverFilters.newAlloc; });
    }

    if (countEl) countEl.textContent = people.length + ' / ' + state.allPersonnel.length;

    list.innerHTML = '';

    if (people.length === 0) {
      list.appendChild(el('div', { className: 'pool-empty' },
        state.allPersonnel.length === 0
          ? 'Import a JSON file to get started'
          : 'No matches found'
      ));
      return;
    }

    people.forEach(function (person) {
      list.appendChild(createPersonCard(person, 'pool'));
    });
  }

  function createPersonCard(person, source) {
    var rc = rankColor(person['Rank Code']);
    var ini = initials(person['First Name'], person['Last Name']);
    var city = person['Physical Location City'] || '';
    var country = person['Physical Location Country'] || '';
    var location = [city, country].filter(Boolean).join(', ');

    var assignCount = countAssignments(person.GPN);

    var card = el('div', { className: 'person-card' + (assignCount > 0 ? ' person-card--assigned' : ''), dataset: { gpn: person.GPN } },
      el('div', { className: 'person-card__avatar', style: 'background:' + rc }, ini),
      el('div', { className: 'person-card__info' },
        el('div', { className: 'person-card__name' },
          escapeHtml(person['First Name']) + ' ' + escapeHtml(person['Last Name'])
        ),
        el('div', { className: 'person-card__meta' },
          el('span', { className: 'person-card__rank', style: 'border-color:' + rc + ';color:' + rc },
            escapeHtml(person['Rank Code'] || '—')
          ),
          location
            ? el('span', { className: 'person-card__location' }, '📍 ' + escapeHtml(location))
            : null
        )
      ),
      assignCount > 0
        ? el('div', { className: 'person-card__badge' }, '×' + assignCount)
        : null,
      el('div', { style: 'display: flex; align-items: center; gap: 4px;' },
        el('button', {
          className: 'btn-icon',
          style: 'padding: 2px; width: 22px; height: 22px; font-size: 0.75rem; display: flex; align-items: center; justify-content: center;',
          title: 'Edit Person',
          onClick: function (e) {
            e.stopPropagation();
            openAddPersonModal(person.GPN);
          }
        }, '✏️'),
        el('div', { className: 'person-card__drag-handle' }, '⠿')
      )
    );

    card.title = [
      'GPN: ' + person.GPN,
      'Role: ' + (person['Role Name'] || '—'),
      'Allocation: ' + (person['Current Allocation'] || '—'),
      'Assignments: ' + assignCount,
      person['Comment'] ? 'Note: ' + person['Comment'] : null,
    ].filter(Boolean).join('\n');

    makeDraggable(card, person.GPN, source);
    return card;
  }

  // ─────────────────────────────────────────────
  // SECTION 7: Workspace, Hierarchy & Matrix
  // ─────────────────────────────────────────────

  function initWorkspace() {
    on('teams', renderWorkspace);
    on('transversals', renderWorkspace);
    on('pool', renderWorkspace);
    on('pages', renderWorkspace);

    document.addEventListener('dblclick', function (e) {
      var card = e.target.closest('.leadership-card');
      if (!card) return;
      var field = card.dataset.field; // 'sponsor' or 'lead'
      if (!field) return;

      var textEl = card.querySelector('.leadership-card__name');
      if (!textEl) return;

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'leadership-inline-edit';
      input.value = textEl.textContent;
      textEl.replaceWith(input);
      input.focus();
      input.select();

      var commit = function () {
        var val = input.value.trim();
        if (val) {
          var pg = getActivePage();
          if (pg) {
            if (field === 'sponsor') {
              pg.sponsor.name = val;
            } else {
              pg.sectionLead.name = val;
            }
          }
        }
        renderWorkspace();
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') renderWorkspace();
      });
    });

    renderWorkspace();

    window.addEventListener('resize', updateConnectorLines);
    var mainViewport = $('.viewport');
    if (mainViewport) {
      mainViewport.addEventListener('scroll', updateConnectorLines);
    }
  }

  function renderWorkspace() {
    var workspace = $('#org-workspace');
    if (!workspace) return;
    workspace.innerHTML = '';
    workspace.classList.toggle('names-only-active', _filterNamesOnly);

    // Render tabs first so they show up even when page is empty/null!
    renderTabs();
    updatePageLinkDropdown();

    var page = getActivePage();

    // Update toolbar title to active page name
    var toolbarTitle = $('.toolbar__title');
    if (toolbarTitle) {
      toolbarTitle.textContent = page ? page.name : 'Organization Matrix';
    }

    if (!page) {
      var emptyEl = el('div', { className: 'matrix-empty' },
        el('div', { className: 'matrix-empty__icon' }, '📄'),
        el('div', { className: 'matrix-empty__text' }, 'Create a vertical in the Setup panel to begin building the organization matrix')
      );
      workspace.appendChild(emptyEl);
      return;
    }

    // Cell (1,1): Sponsor Card Cell
    var sponsorCard = el('div', { className: 'leadership-card sponsor-card', dataset: { field: 'sponsor' } },
      el('div', { className: 'leadership-card__name' }, page.sponsor.name)
    );
    var sponsorCell = el('div', { className: 'sponsor-cell' }, sponsorCard);
    workspace.appendChild(sponsorCell);

    // Cell (2,1): Section Lead Card Cell
    var sectionLeadCard = el('div', { className: 'leadership-card lead-card', dataset: { field: 'lead' } },
      el('div', { className: 'leadership-card__name' }, page.sectionLead.name)
    );
    var leadCell = el('div', { className: 'lead-cell' }, sectionLeadCard);
    workspace.appendChild(leadCell);

    // Cell (2,2): Matrix side Cell
    var matrixContainer = el('div', { className: 'matrix-side matrix-cell', id: 'matrix-container' });

    // SVG overlay for connectors
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'connector-svg');
    matrixContainer.appendChild(svg);

    if (page.teams.length === 0) {
      var emptyEl = el('div', { className: 'matrix-empty' },
        el('div', { className: 'matrix-empty__icon' }, '🏗️'),
        el('div', { className: 'matrix-empty__text' }, 'Create your first team to start building the matrix')
      );
      matrixContainer.appendChild(emptyEl);
      workspace.appendChild(matrixContainer);
      return;
    }

    var orderedIds = computeTeamOrder();
    var orderedTeams = orderedIds.map(function (id) {
      return page.teams.find(function (t) { return t.id === id; });
    }).filter(Boolean);

    // Grid of Pillars
    var colWidthStr = state.limitColWidth
      ? 'repeat(' + orderedTeams.length + ', ' + state.maxColWidth + 'px)'
      : 'repeat(' + orderedTeams.length + ', minmax(240px, 1fr))';

    var grid = el('div', {
      className: 'matrix-grid',
      style: 'grid-template-columns: ' + colWidthStr + ';',
    });

    orderedTeams.forEach(function (team) {
      grid.appendChild(createPillar(team));
    });

    var innerContainer = el('div', { className: 'matrix-inner-container', style: 'width: fit-content;' });
    innerContainer.appendChild(grid);

    // Transversal overlays
    if (page.transversals.length > 0) {
      var bandsContainer = el('div', { className: 'matrix-bands' });
      page.transversals.forEach(function (tv) {
        var span = getTransversalSpan(tv, orderedIds);
        if (!span) return;
        bandsContainer.appendChild(createTransversalBand(tv, span, orderedTeams.length));
      });
      innerContainer.appendChild(bandsContainer);
    }

    matrixContainer.appendChild(innerContainer);
    workspace.appendChild(matrixContainer);

    // Draw connections immediately
    setTimeout(updateConnectorLines, 0);
  }

  function updateConnectorLines() {
    var svg = $('#connector-svg');
    var leadCard = $('.lead-card');
    var pillars = $$('.pillar-wrapper');
    var matrixSide = $('.matrix-side');
    if (!svg || !leadCard || pillars.length === 0 || !matrixSide) return;

    svg.innerHTML = '';

    var matrixRect = matrixSide.getBoundingClientRect();
    var leadRect = leadCard.getBoundingClientRect();

    // Start point: top-right corner of Section Lead card, nudged left so it touches the card border
    var startX = leadRect.right - matrixRect.left - 5;
    var startY = leadRect.top - matrixRect.top + 1;

    // Collect each pillar's center X and top Y
    var points = [];
    pillars.forEach(function (pw) {
      var r = pw.getBoundingClientRect();
      points.push({
        cx: (r.left + r.width / 2) - matrixRect.left,
        top: r.top - matrixRect.top
      });
    });

    // Find the rightmost pillar center for the trunk endpoint
    var maxX = Math.max.apply(null, points.map(function (p) { return p.cx; }));

    // 1) Single horizontal trunk line from lead card to rightmost pillar
    var trunk = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    trunk.setAttribute('x1', startX);
    trunk.setAttribute('y1', startY);
    trunk.setAttribute('x2', maxX);
    trunk.setAttribute('y2', startY);
    trunk.setAttribute('stroke', '#94a3b8');
    trunk.setAttribute('stroke-width', '2');
    svg.appendChild(trunk);

    // 2) Individual vertical drops from the trunk down to each pillar top
    points.forEach(function (pt) {
      var drop = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      drop.setAttribute('x1', pt.cx);
      drop.setAttribute('y1', startY);
      drop.setAttribute('x2', pt.cx);
      drop.setAttribute('y2', pt.top);
      drop.setAttribute('stroke', '#94a3b8');
      drop.setAttribute('stroke-width', '2');
      svg.appendChild(drop);
    });
  }

  function getPageStats(page) {
    var teamsCount = page.teams.filter(function (t) { return t.type !== 'page-link'; }).length;
    var uniqueGpnSet = {};
    page.teams.forEach(function (t) {
      if (t.type === 'page-link') return;
      t.memberGPNs.forEach(function (gpn) {
        uniqueGpnSet[gpn] = true;
      });
      if (t.lead) uniqueGpnSet[t.lead] = true;
    });
    return {
      teams: teamsCount,
      people: Object.keys(uniqueGpnSet).length
    };
  }

  function createPageLinkPillar(team) {
    var targetPage = state.pages.find(function (p) { return p.id === team.targetPageId; });
    var wrapper = el('div', { className: 'pillar-wrapper flip-card pillar-wrapper--page-link', dataset: { teamId: team.id } });

    if (!targetPage) {
      var brokenInner = el('div', { className: 'flip-card__inner' });
      var brokenFront = el('div', { className: 'pillar flip-card__front pillar--broken' },
        el('div', { className: 'pillar__header' },
          el('div', { className: 'pillar__title' }, 'Broken Link')
        ),
        el('div', { className: 'pillar__desc-body' }, 'Target vertical was deleted.'),
        el('div', { className: 'pillar__footer' },
          el('button', {
            className: 'btn-icon btn-icon--danger',
            onClick: function (e) { e.stopPropagation(); deleteTeam(team.id); }
          }, '🗑️')
        )
      );
      brokenInner.appendChild(brokenFront);
      wrapper.appendChild(brokenInner);
      return wrapper;
    }

    var inner = el('div', { className: 'flip-card__inner' });
    var stats = getPageStats(targetPage);

    var activatePageHandler = function (e) {
      if (e.target.closest('.btn-icon--danger')) return;
      switchPage(targetPage.id);
    };

    // FRONT FACE
    var front = el('div', {
      className: 'pillar pillar-front flip-card__front pillar--page-link',
      onClick: activatePageHandler
    });

    var frontHeader = el('div', { className: 'pillar__header' },
      el('span', { style: 'margin-right: 6px;' }, '🔗'),
      el('div', { className: 'pillar__title', style: 'font-weight: 800;' }, escapeHtml(targetPage.name))
    );
    front.appendChild(frontHeader);

    var leadSlot = el('div', { className: 'pillar__lead-slot', style: 'background: #fdfdfd; padding: var(--space-lg) var(--space-md); flex: 1; display: flex; align-items: center; justify-content: center; text-align: center;' },
      el('div', { className: 'mini-card', style: 'border: none; padding: 0; background: transparent; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;' },
        el('div', { className: 'mini-card__name', style: 'font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-xs);' }, escapeHtml(targetPage.sectionLead.name)),
        el('div', { className: 'mini-card__subtext', style: 'color: var(--ubs-red); font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 4px; justify-content: center;' },
          escapeHtml(team.managerTitle),
          el('button', {
            className: 'btn-icon page-link__edit-title-btn',
            style: 'font-size: 0.75rem; padding: 2px; width: 18px; height: 18px; line-height: 1; margin: 0;',
            title: 'Edit Manager Title',
            onClick: function (e) {
              e.stopPropagation();
              var newTitle = prompt('Edit Manager Title for vertical link:', team.managerTitle || 'TBD');
              if (newTitle !== null) {
                team.managerTitle = newTitle.trim() || 'TBD';
                emit('teams');
              }
            }
          }, '✏️')
        )
      )
    );
    front.appendChild(leadSlot);

    var frontFooter = el('div', { className: 'pillar__footer' },
      el('span', { style: 'font-weight: 600; color: var(--text-secondary); font-size: 0.8rem;' }, stats.teams + ' Teams · ' + stats.people + ' People'),
      el('button', {
        className: 'btn-icon btn-icon--danger',
        title: 'Delete link',
        onClick: function (e) {
          e.stopPropagation();
          if (confirm('Delete vertical link to "' + targetPage.name + '"?')) {
            deleteTeam(team.id);
          }
        }
      }, '🗑️')
    );
    front.appendChild(frontFooter);

    // BACK FACE
    var back = el('div', {
      className: 'pillar pillar-back flip-card__back pillar--page-link',
      onClick: activatePageHandler
    });

    var backHeader = el('div', { className: 'pillar__header' },
      el('span', { style: 'margin-right: 6px;' }, '🔗'),
      el('div', { className: 'pillar__title', style: 'font-weight: 800;' }, escapeHtml(targetPage.name))
    );
    back.appendChild(backHeader);

    var descBody = el('div', { className: 'pillar__desc-body' },
      el('div', { className: 'pillar__desc-label', style: 'display: flex; justify-content: space-between; align-items: center;' },
        'VERTICAL LINK DESCRIPTION',
        el('button', {
          className: 'btn-icon pillar__edit-desc-btn',
          title: 'Edit description',
          onClick: function (e) {
            e.stopPropagation();
            openDescriptionEditModal('Edit Link Description for ' + targetPage.name, team.description || '', function (newDesc) {
              team.description = newDesc;
              emit('teams');
            });
          }
        }, '✏️')
      ),
      el('div', { className: 'pillar__desc-text' }, escapeHtml(team.description || 'No description provided.'))
    );
    back.appendChild(descBody);

    var backFooter = el('div', { className: 'pillar__footer' },
      el('span', { style: 'font-weight: 600; color: var(--text-secondary); font-size: 0.8rem;' }, stats.teams + ' Teams · ' + stats.people + ' People')
    );
    back.appendChild(backFooter);

    inner.appendChild(front);
    inner.appendChild(back);
    wrapper.appendChild(inner);

    return wrapper;
  }

  function createPillar(team) {
    if (team.type === 'page-link') {
      return createPageLinkPillar(team);
    }
    var allMembers = resolveMembers(team);
    var nonLeadMembers = allMembers.filter(function (m) { return m.GPN !== team.lead; });

    var wrapper = el('div', { className: 'pillar-wrapper flip-card', dataset: { teamId: team.id } });
    if (team.lead && nonLeadMembers.length === 0) {
      wrapper.classList.add('pillar-wrapper--lead-only');
    }
    var inner = el('div', { className: 'flip-card__inner' });

    // ── FRONT FACE ──
    var front = el('div', { className: 'pillar pillar-front flip-card__front' });

    // Front Header (No info button)
    var frontHeader = el('div', { className: 'pillar__header' },
      el('div', { className: 'pillar__title' }, escapeHtml(team.name))
    );
    front.appendChild(frontHeader);

    var leadPerson = team.lead ? getPersonByGPN(team.lead) : null;
    var leadSlot = el('div', { className: 'pillar__lead-slot' },
      el('div', { className: 'pillar__lead-label' }, 'LINE MANAGER'),
      leadPerson
        ? (function () {
          var leadEl = createMiniCard(leadPerson, team.id);
          leadEl.classList.add('pillar__lead-card');
          return leadEl;
        })()
        : el('div', { className: 'pillar__lead-tbd' }, 'TBD')
    );
    makeDropZone(leadSlot, 'team-lead', team.id);
    front.appendChild(leadSlot);

    // Header for members count (matches screenshot)
    var membersHeader = el('div', { className: 'pillar__members-header' },
      escapeHtml(nonLeadMembers.length + ' ASSIGNED PEOPLE')
    );
    front.appendChild(membersHeader);

    var membersList = el('div', { className: 'pillar__members' });
    makeDropZone(membersList, 'team', team.id);

    if (nonLeadMembers.length === 0) {
      membersList.appendChild(el('div', { className: 'pillar__members-empty' }, 'Drag people here'));
    } else {
      nonLeadMembers.forEach(function (member) {
        membersList.appendChild(createMiniCard(member, team.id));
      });
    }
    front.appendChild(membersList);

    // Footer
    var teamId = team.id;
    var teamName = team.name;
    var frontFooter = el('div', { className: 'pillar__footer' },
      el('span', {}, team.memberGPNs.length + ' member' + (team.memberGPNs.length !== 1 ? 's' : '')),
      el('button', {
        className: 'btn-icon btn-icon--danger',
        title: 'Delete team',
        onClick: function () {
          if (confirm('Delete team "' + teamName + '" and return all members to pool?')) {
            deleteTeam(teamId);
          }
        }
      }, '🗑️')
    );
    front.appendChild(frontFooter);


    // ── BACK FACE ──
    var back = el('div', { className: 'pillar pillar-back flip-card__back' });

    // Back Header (No close button)
    var backHeader = el('div', { className: 'pillar__header' },
      el('div', { className: 'pillar__title' }, escapeHtml(team.name))
    );
    back.appendChild(backHeader);

    // Description text body (below the team name where the members would be)
    var descBody = el('div', { className: 'pillar__desc-body' },
      el('div', { className: 'pillar__desc-label', style: 'display: flex; justify-content: space-between; align-items: center;' },
        'TEAM DESCRIPTION',
        el('button', {
          className: 'btn-icon pillar__edit-desc-btn',
          title: 'Edit description',
          onClick: function (e) {
            e.stopPropagation();
            openDescriptionEditModal('Edit Description for ' + team.name, team.description || '', function (newDesc) {
              team.description = newDesc;
              emit('teams');
            });
          }
        }, '✏️')
      ),
      el('div', { className: 'pillar__desc-text' }, escapeHtml(team.description || 'No description provided.'))
    );
    back.appendChild(descBody);

    // Back Footer
    var backFooter = el('div', { className: 'pillar__footer' },
      el('span', {}, 'Info View')
    );
    back.appendChild(backFooter);

    inner.appendChild(front);
    inner.appendChild(back);
    wrapper.appendChild(inner);

    return wrapper;
  }

  function createMiniCard(person, teamId) {
    var rank = person['Rank Code'] || '—';
    var rc = rankColor(rank);
    var gpn = person.GPN || '';
    var city = person['Physical Location City'] || '';
    var country = person['Physical Location Country'] || '';

    var locParts = [];
    if (city) locParts.push(city);
    if (country) locParts.push(country);
    var locString = locParts.join(', ');

    var fullName = person['First Name'] + ' ' + person['Last Name'];

    var card = el('div', { className: 'mini-card', dataset: { gpn: person.GPN } },
      el('div', { className: 'mini-card__main' },
        el('span', { className: 'mini-card__name' }, escapeHtml(fullName)),
        gpn ? el('span', { className: 'mini-card__dot' }, ' · ') : null,
        gpn ? el('span', { className: 'mini-card__role' }, escapeHtml(gpn)) : null,
        locString ? el('span', { className: 'mini-card__dot' }, ' · ') : null,
        locString ? el('span', { className: 'mini-card__loc' }, escapeHtml(locString)) : null
      ),
      rank && rank !== '—'
        ? el('span', { className: 'mini-card__rank', style: 'border-color:' + rc + ';color:' + rc }, escapeHtml(rank))
        : null
    );

    card.title = [
      'GPN: ' + person.GPN,
      'Role: ' + (person['Role Name'] || '—'),
      'Allocation: ' + (person['Current Allocation'] || '—'),
      person['Comment'] ? 'Note: ' + person['Comment'] : null,
    ].filter(Boolean).join('\n');

    makeDraggable(card, person.GPN, teamId);
    return card;
  }

  function createTransversalBand(tv, span, totalCols) {
    var band = el('div', {
      className: 'transversal-band flip-card',
      style: '--span-start: ' + (span.start + 1) + '; --span-end: ' + (span.end + 2) + '; --total-cols: ' + totalCols + ';',
      dataset: { tvId: tv.id },
    });

    var inner = el('div', { className: 'flip-card__inner' });

    var leads = tv.leads || (tv.lead ? [tv.lead] : []);
    var leadPeople = leads.map(function (gpn) {
      return getPersonByGPN(gpn);
    }).filter(Boolean);

    var tvId = tv.id;
    var tvName = tv.name;

    // FRONT FACE
    var front = el('div', { className: 'transversal-band-front flip-card__front' });

    var leadsContainer = el('div', { className: 'transversal-band__leads' });
    if (leadPeople.length > 0) {
      leadPeople.forEach(function (person) {
        var rc = rankColor(person['Rank Code']);
        var pill = el('span', { className: 'transversal-band__lead-pill', dataset: { gpn: person.GPN } },
          el('span', { className: 'transversal-band__lead-pill-bullet', style: 'color:' + rc }, '⬤'),
          el('span', { className: 'transversal-band__lead-pill-name' }, escapeHtml(person['First Name']) + ' ' + escapeHtml(person['Last Name'])),
          el('button', {
            type: 'button',
            className: 'transversal-band__lead-remove',
            title: 'Remove lead',
            onClick: function (e) {
              e.stopPropagation();
              removeTransversalLead(person.GPN, tvId);
            }
          }, '✕')
        );
        makeDraggable(pill, person.GPN, 'transversal-lead');
        leadsContainer.appendChild(pill);
      });
    } else {
      leadsContainer.appendChild(
        el('span', { className: 'transversal-band__lead transversal-band__lead--empty' }, '⬤ Drop person to set as lead')
      );
    }

    var header = el('div', { className: 'transversal-band__header' },
      el('span', { className: 'transversal-band__name' }, escapeHtml(tv.name)),
      leadsContainer,
      el('div', { className: 'transversal-band__actions' },
        el('button', {
          className: 'btn-icon',
          title: 'Edit',
          onClick: function () { openTransversalModal(tvId); },
        }, '✏️'),
        el('button', {
          className: 'btn-icon btn-icon--danger',
          title: 'Delete',
          onClick: function () {
            if (confirm('Delete "' + tvName + '"?')) deleteTransversal(tvId);
          },
        }, '🗑️')
      )
    );
    makeDropZone(header, 'transversal-lead', tvId);
    front.appendChild(header);

    // BACK FACE
    var back = el('div', { className: 'transversal-band-back flip-card__back' });
    var backHeader = el('div', { className: 'transversal-band__header', style: 'border-bottom: none; width: 100%; display: flex; align-items: center; gap: var(--space-md);' },
      el('span', { className: 'transversal-band__name', style: 'font-weight: 800; white-space: nowrap;' }, escapeHtml(tv.name)),
      el('span', { style: 'font-size: 0.85rem; color: var(--text-secondary); flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' }, escapeHtml(tv.description || 'No description.'))
    );
    back.appendChild(backHeader);

    inner.appendChild(front);
    inner.appendChild(back);
    band.appendChild(inner);

    return band;
  }

  // ─────────────────────────────────────────────
  // SECTION 8: Team Manager
  // ─────────────────────────────────────────────

  function initTeamManager() {
    var form = $('#create-team-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nameInput = $('#team-name-input');
      var descInput = $('#team-desc-input');
      var name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }

      var page = getActivePage();
      page.teams.push({
        id: uid(),
        name: name,
        lead: null,
        description: descInput.value.trim(),
        memberGPNs: [],
      });

      nameInput.value = '';
      descInput.value = '';
      emit('teams', 'transversals');
      showToast('Team "' + name + '" created');
    });
  }

  function deleteTeam(teamId) {
    var page = getActivePage();
    var idx = page.teams.findIndex(function (t) { return t.id === teamId; });
    if (idx === -1) return;
    var team = page.teams[idx];
    // No need to return people to pool — they were never removed
    page.transversals.forEach(function (tv) {
      tv.targetTeamIds = tv.targetTeamIds.filter(function (id) { return id !== teamId; });
    });
    page.teams.splice(idx, 1);
    emit('teams', 'pool', 'transversals');
    showToast('Team "' + team.name + '" deleted');
  }

  function openDescriptionEditModal(title, currentText, onSave) {
    var prev = $('#description-edit-modal');
    if (prev) prev.remove();

    var overlay = el('div', { className: 'modal-overlay', id: 'description-edit-modal' });

    var textarea = el('textarea', {
      className: 'form-input form-textarea',
      style: 'height: 120px; font-family: inherit;',
      placeholder: 'Enter description here…',
    }, currentText || '');

    var formEl = el('form', { className: 'modal__body' },
      el('label', { className: 'form-label' }, 'Description'),
      textarea,
      el('div', { className: 'modal__actions' },
        el('button', { type: 'button', className: 'btn btn--ghost', onClick: function () { overlay.remove(); } }, 'Cancel'),
        el('button', { type: 'submit', className: 'btn btn--primary' }, 'Save')
      )
    );

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      onSave(textarea.value.trim());
      overlay.remove();
    });

    var modal = el('div', { className: 'modal' },
      el('div', { className: 'modal__header' },
        el('h3', {}, title),
        el('button', {
          className: 'modal__close', type: 'button',
          onClick: function () { overlay.remove(); }
        }, '✕')
      ),
      formEl
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { textarea.focus(); });
  }

  // ─────────────────────────────────────────────
  // SECTION 9: Transversal Manager
  // ─────────────────────────────────────────────

  function initTransversalManager() {
    var btn = $('#open-transversal-modal');
    if (btn) {
      btn.addEventListener('click', function () { openTransversalModal(); });
    }
  }

  function openTransversalModal(existingId) {
    var page = getActivePage();
    var existing = existingId
      ? page.transversals.find(function (t) { return t.id === existingId; })
      : null;

    var prev = $('#transversal-modal');
    if (prev) prev.remove();

    var overlay = el('div', { className: 'modal-overlay', id: 'transversal-modal' });

    // Team checklist (includes both teams and vertical links)
    var checklistEl = el('div', { className: 'tv-team-checklist' });
    if (page.teams.length === 0) {
      checklistEl.appendChild(el('div', { className: 'tv-team-checklist__empty' }, 'Create some teams or vertical links first'));
    } else {
      page.teams.forEach(function (team) {
        var isChecked = existing ? existing.targetTeamIds.indexOf(team.id) !== -1 : true;
        var checkbox = el('input', {
          type: 'checkbox',
          className: 'tv-team-checkbox',
          value: team.id,
        });
        if (isChecked) checkbox.checked = true;

        var targetPage = state.pages.find(function (p) { return p.id === team.targetPageId; });
        var displayName = team.type === 'page-link'
          ? (targetPage ? targetPage.name + ' (Link)' : 'Broken Link')
          : team.name;

        checklistEl.appendChild(
          el('label', { className: 'tv-team-checklist__item' },
            checkbox,
            el('span', {}, ' ' + displayName)
          )
        );
      });
    }

    var nameInput = el('input', {
      type: 'text', id: 'tv-name', className: 'form-input',
      placeholder: 'e.g. Quality Assurance, DevOps…',
      value: existing ? existing.name : '',
    });

    var descTextarea = el('textarea', {
      id: 'tv-desc', className: 'form-input form-textarea',
      placeholder: 'Purpose of this transversal…',
    }, existing ? existing.description : '');

    var leadsSection = null;
    if (existing) {
      var leads = existing.leads || (existing.lead ? [existing.lead] : []);
      var leadPeople = leads.map(getPersonByGPN).filter(Boolean);

      var leadsContainer = el('div', { className: 'tv-modal-leads' });
      if (leadPeople.length > 0) {
        leadPeople.forEach(function (person) {
          leadsContainer.appendChild(
            el('div', { className: 'tv-modal-lead-item' },
              el('span', {}, escapeHtml(person['First Name']) + ' ' + escapeHtml(person['Last Name'])),
              el('button', {
                type: 'button',
                className: 'btn-icon btn-icon--danger btn-small',
                title: 'Remove Lead',
                onClick: function () {
                  removeTransversalLead(person.GPN, existing.id);
                  openTransversalModal(existing.id);
                }
              }, '🗑️')
            )
          );
        });
      } else {
        leadsContainer.appendChild(el('div', { className: 'tv-modal-leads__empty' }, 'No leads assigned.'));
      }

      leadsSection = el('div', { className: 'form-section' },
        el('label', { className: 'form-label' }, 'Leads'),
        leadsContainer
      );
    }

    var formEl = el('form', { className: 'modal__body', id: 'transversal-form' },
      el('label', { className: 'form-label' }, 'Name'),
      nameInput,
      el('label', { className: 'form-label' }, 'Description'),
      descTextarea,
      leadsSection,
      el('label', { className: 'form-label' }, 'Spans across teams:'),
      checklistEl,
      el('div', { className: 'modal__actions' },
        el('button', { type: 'button', className: 'btn btn--ghost', onClick: function () { overlay.remove(); } }, 'Cancel'),
        el('button', { type: 'submit', className: 'btn btn--primary' }, existing ? 'Update' : 'Create')
      )
    );

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }

      var desc = descTextarea.value.trim();
      var checkedTeamIds = $$('.tv-team-checkbox:checked', overlay).map(function (cb) { return cb.value; });

      if (existing) {
        existing.name = name;
        existing.description = desc;
        existing.targetTeamIds = checkedTeamIds;
        showToast('"' + name + '" updated');
      } else {
        getActivePage().transversals.push({
          id: uid(),
          name: name,
          lead: null,
          leads: [],
          description: desc,
          targetTeamIds: checkedTeamIds,
          collapsed: true,
        });
        showToast('"' + name + '" created');
      }

      overlay.remove();
      emit('transversals', 'teams');
    });

    var modal = el('div', { className: 'modal' },
      el('div', { className: 'modal__header' },
        el('h3', {}, existing ? 'Edit Transversal' : 'Create Transversal'),
        el('button', {
          className: 'modal__close', type: 'button',
          onClick: function () { overlay.remove(); }
        }, '✕')
      ),
      formEl
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { nameInput.focus(); });
  }

  // Delete a transversal
  function deleteTransversal(tvId) {
    var page = getActivePage();
    var idx = page.transversals.findIndex(function (t) { return t.id === tvId; });
    if (idx === -1) return;
    var name = page.transversals[idx].name;
    page.transversals.splice(idx, 1);
    emit('transversals', 'teams');
    showToast('"' + name + '" deleted');
  }

  // Toggle collapse
  function toggleTransversalCollapse(tvId) {
    var page = getActivePage();
    var tv = page.transversals.find(function (t) { return t.id === tvId; });
    if (tv) {
      tv.collapsed = !tv.collapsed;
      emit('transversals');
    }
  }

  // ─────────────────────────────────────────────
  // SECTION 10: Page Management
  // ─────────────────────────────────────────────

  function renderTabs() {
    var tabBar = $('#page-tabs');
    if (!tabBar) return;
    tabBar.innerHTML = '';

    if (state.pages.length === 0) {
      tabBar.style.display = 'none';
      return;
    }
    tabBar.style.display = 'flex';

    state.pages.forEach(function (page) {
      var isActive = page.id === state.activePageId;
      var tab = el('button', {
        className: 'page-tab' + (isActive ? ' page-tab--active' : ''),
        dataset: { pageId: page.id },
        onClick: function () { switchPage(page.id); },
        onDblclick: function (e) {
          e.stopPropagation();
          renamePage(page.id, tab);
        },
      }, escapeHtml(page.name));

      // Right-click context menu for delete
      tab.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (confirm('Delete vertical "' + page.name + '"? Teams on this vertical will be removed.')) {
          deletePage(page.id);
        }
      });

      tabBar.appendChild(tab);
    });
  }

  function switchPage(pageId) {
    if (state.activePageId === pageId) return;
    state.activePageId = pageId;
    emit('pages', 'teams', 'transversals', 'pool');
  }

  function renamePage(pageId, tabEl) {
    var page = state.pages.find(function (p) { return p.id === pageId; });
    if (!page) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'page-tab-edit';
    input.value = page.name;
    tabEl.textContent = '';
    tabEl.appendChild(input);
    input.focus();
    input.select();

    var commit = function () {
      var val = input.value.trim();
      if (val) {
        page.name = val;
      }
      renderTabs();
      renderWorkspace();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') { renderTabs(); }
    });
  }

  function deletePage(pageId) {
    var idx = state.pages.findIndex(function (p) { return p.id === pageId; });
    if (idx === -1) return;
    var name = state.pages[idx].name;
    state.pages.splice(idx, 1);
    
    if (state.pages.length > 0) {
      state.activePageId = state.pages[0].id;
    } else {
      state.activePageId = null;
    }
    
    emit('pages', 'teams', 'transversals', 'pool');
    showToast('Vertical "' + name + '" deleted');
  }

  // ── Sidebar Tabs & Creation Forms ──

  function initLayoutSettings() {
    var checkbox = $('#layout-limit-width');
    var slider = $('#layout-max-width');
    var valueEl = $('#layout-max-width-value');
    var group = $('#layout-width-control-group');

    if (!checkbox || !slider || !valueEl || !group) return;

    // Set initial values from state
    checkbox.checked = !!state.limitColWidth;
    slider.value = state.maxColWidth || 260;
    valueEl.textContent = slider.value + 'px';

    var updateControlsVisibility = function () {
      if (checkbox.checked) {
        group.style.opacity = '1';
        group.style.pointerEvents = 'auto';
      } else {
        group.style.opacity = '0.5';
        group.style.pointerEvents = 'none';
      }
    };

    updateControlsVisibility();

    checkbox.addEventListener('change', function () {
      state.limitColWidth = checkbox.checked;
      updateControlsVisibility();
      saveState();
      emit('teams', 'pages');
    });

    slider.addEventListener('input', function () {
      state.maxColWidth = parseInt(slider.value, 10) || 260;
      valueEl.textContent = slider.value + 'px';
      saveState();
      emit('teams', 'pages');
    });
  }

  function initSidebarTabs() {
    var btnPersonnel = $('#tab-btn-personnel');
    var btnSetup = $('#tab-btn-setup');
    var panelPersonnel = $('#panel-personnel');
    var panelSetup = $('#panel-setup');

    if (btnPersonnel && btnSetup && panelPersonnel && panelSetup) {
      btnPersonnel.addEventListener('click', function () {
        btnPersonnel.classList.add('active');
        btnSetup.classList.remove('active');
        panelPersonnel.classList.add('tab-panel--active');
        panelSetup.classList.remove('tab-panel--active');
      });

      btnSetup.addEventListener('click', function () {
        btnSetup.classList.add('active');
        btnPersonnel.classList.remove('active');
        panelSetup.classList.add('tab-panel--active');
        panelPersonnel.classList.remove('tab-panel--active');
      });
    }
  }

  function initPageManager() {
    var form = $('#create-page-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nameInput = $('#page-name-input');
      var leadInput = $('#page-lead-input');

      var name = nameInput.value.trim();
      var lead = leadInput.value.trim();

      if (!name || !lead) return;

      var currentPage = getActivePage();
      var sponsor = currentPage ? (currentPage.sectionLead ? currentPage.sectionLead.name : 'TBD') : 'TBD';

      var newPage = {
        id: uid(),
        name: name,
        sponsor: { name: sponsor },
        sectionLead: { name: lead },
        teams: [],
        transversals: [],
      };

      state.pages.push(newPage);
      state.activePageId = newPage.id;

      if (currentPage) {
        currentPage.teams.push({
          id: uid(),
          type: 'page-link',
          targetPageId: newPage.id,
          managerTitle: 'TBD',
          description: '',
          memberGPNs: [],
        });
      }

      // Reset inputs
      nameInput.value = '';
      leadInput.value = '';

      emit('pages', 'teams', 'transversals', 'pool');
      showToast('Vertical "' + name + '" created');
    });
  }

  function updatePageLinkDropdown() {
    var select = $('#page-link-target');
    if (!select) return;
    var activePage = getActivePage();
    select.innerHTML = '<option value="">Select Vertical to Link</option>';
    var count = 0;
    state.pages.forEach(function (page) {
      if (activePage && page.id === activePage.id) return;
      var opt = el('option', { value: page.id }, page.name);
      select.appendChild(opt);
      count++;
    });

    var form = $('#create-page-link-form');
    if (form) {
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        if (count === 0) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'No Verticals to Link';
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = '＋ Create Vertical Link';
        }
      }
    }
  }

  function initPageLinkManager() {
    var form = $('#create-page-link-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var targetSelect = $('#page-link-target');
      var titleInput = $('#page-link-title');
      var descInput = $('#page-link-desc');

      var targetPageId = targetSelect.value;
      var title = titleInput.value.trim();
      var desc = descInput.value.trim();

      if (!targetPageId || !title) return;

      var page = getActivePage();
      if (!page) {
        showToast('Create a vertical first before linking.');
        return;
      }

      page.teams.push({
        id: uid(),
        type: 'page-link',
        targetPageId: targetPageId,
        managerTitle: title,
        description: desc,
        memberGPNs: [],
      });

      targetSelect.value = '';
      titleInput.value = '';
      descInput.value = '';

      emit('teams');
      showToast('Vertical link created');
    });
  }

  // ─────────────────────────────────────────────
  // SECTION 11: App Initialization
  // ─────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var fileInput = $('#file-import');
    var importBtn = $('#import-btn');
    var importStatus = $('#import-status');

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', function () { fileInput.click(); });

      fileInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;

        importStatus.textContent = 'Importing…';
        importStatus.className = 'import-status import-status--loading';

        importJSON(file, function (result) {
          if (result.ok) {
            importStatus.textContent = '✓ Imported ' + result.count + ' people';
            importStatus.className = 'import-status import-status--success';
          } else {
            importStatus.textContent = '✗ ' + result.errors[0];
            importStatus.className = 'import-status import-status--error';
          }
          fileInput.value = '';
        });
      });
    }

    // Workspace Import/Export bindings
    var btnNew = $('#new-workspace-btn');
    var btnExport = $('#export-workspace-btn');
    var btnImport = $('#import-workspace-btn');
    var fileWorkspace = $('#workspace-import-file');

    if (btnNew) {
      btnNew.addEventListener('click', resetWorkspace);
    }
    if (btnExport) {
      btnExport.addEventListener('click', exportWorkspace);
    }
    if (btnImport && fileWorkspace) {
      btnImport.addEventListener('click', function () { fileWorkspace.click(); });
      fileWorkspace.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        importWorkspace(file, function (res) {
          if (res.ok) {
            showToast('Workspace imported successfully');
          } else {
            showToast('Import failed: ' + res.error);
          }
          fileWorkspace.value = '';
        });
      });
    }

    initLayoutSettings();
    initSidebarTabs();
    initPool();
    initWorkspace();
    initPageManager();
    initPageLinkManager();
    initTeamManager();
    initTransversalManager();

    // Initial tab render
    renderTabs();

    var viewToggle = $('#view-mode-toggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', function () {
        var matrix = $('#matrix-container');
        if (!matrix) return;
        var isFlipped = matrix.classList.toggle('matrix-container--flipped');
        viewToggle.textContent = isFlipped ? 'Show Structure' : 'Show Descriptions';
        viewToggle.classList.toggle('btn--primary', isFlipped);
      });
    }

    var sidebarToggle = $('#sidebar-toggle');
    var sidebar = $('#sidebar');
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', function () {
        sidebar.classList.toggle('sidebar--collapsed');
        // Redraw connections after the panel slide animation completes
        setTimeout(function () {
          window.dispatchEvent(new Event('resize'));
        }, 260);
      });
    }

    console.log('%c🔑 OrgDesigner loaded', 'color:#EC0000;font-size:14px;font-weight:bold');
  });

})();
