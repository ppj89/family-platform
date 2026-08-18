  function optionalInteger(value) {
    var text = String(value || '').replace(/[^\d-]/g, '')
    return text ? Number(text) : null
  }

  function syncDiaryForm(form) {
    window.setTimeout(function () {
      var title = getFieldValue(form, '[data-field="diary-title"]') || getInputValueByLabel(form, '\uC81C\uBAA9')
      var body = getFieldValue(form, '[data-field="diary-body"]') || getFieldValue(form, 'textarea')
      if (!title || !body) return

      var fileInput = form.querySelector('input[type="file"]')
      var submit = form.querySelector('button[type="submit"], .submit-action')
      if (submit && fileInput && fileInput.files && fileInput.files.length) {
        submit.disabled = true
        if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent
        submit.textContent = '\uC5C5\uB85C\uB4DC \uC911'
      }

      uploadMediaFiles(fileInput).then(function (files) {
        queueApiSync({
          type: 'createDiary',
          payload: {
            title: title,
            body: body,
            diaryDate: getDatePickerValue(form, '\uB0A0\uC9DC'),
            weather: getCustomSelectValue('\uB0A0\uC528') || null,
            mood: getCustomSelectValue('\uAE30\uBD84') || null,
            minTemperature: optionalInteger(getInputValueByLabel(form, '\uCD5C\uC800 \uC628\uB3C4')),
            maxTemperature: optionalInteger(getInputValueByLabel(form, '\uCD5C\uACE0 \uC628\uB3C4')),
            mediaUrls: communityMediaUrls(files)
          }
        })
        flushApiQueue()
      }).catch(function (error) {
        if (String(error && error.message || '').indexOf('INVALID_MEDIA') < 0) {
          showPatchToast('\uCCA8\uBD80\uD30C\uC77C \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
        }
      }).finally(function () {
        if (submit) {
          submit.disabled = false
          if (submit.dataset.originalText) submit.textContent = submit.dataset.originalText
        }
      })
    }, 450)
  }

