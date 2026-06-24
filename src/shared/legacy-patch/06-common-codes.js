  var FAMILY_COMMON_CODES = {
    travelRecordCostCategory: [
      { value: '\uAD50\uD1B5', label: '\uAD50\uD1B5' },
      { value: '\uC219\uBC15', label: '\uC219\uBC15' },
      { value: '\uC2DD\uBE44', label: '\uC2DD\uBE44' },
      { value: '\uAD00\uAD11', label: '\uAD00\uAD11' },
      { value: '\uAE30\uD0C0', label: '\uAE30\uD0C0' }
    ]
  }

  function getFamilyCommonCodeItems(groupKey) {
    var items = FAMILY_COMMON_CODES[groupKey] || []
    return items.map(function (item) {
      return { value: item.value, label: item.label }
    })
  }

  function getFamilyCommonDefaultCode(groupKey, fallback) {
    var items = getFamilyCommonCodeItems(groupKey)
    return items.length ? items[0].value : fallback
  }

  function renderFamilyCommonCodeButtons(groupKey, attrName, selectedValue) {
    return getFamilyCommonCodeItems(groupKey).map(function (item) {
      var selected = item.value === selectedValue
      return '<button type="button" ' + attrName + '="' + escapeHtml(item.value) + '"' +
        (selected ? ' class="selected"' : '') + '>' + escapeHtml(item.label) + '</button>'
    }).join('')
  }
