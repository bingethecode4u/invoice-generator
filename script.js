/* =============================================================
   GST Invoice Generator — script.js
   Vanilla JS | LocalStorage | No external deps except html2pdf
   ============================================================= */

'use strict';

// ── Indian States with GST state codes ─────────────────────────
const INDIAN_STATES = [
  { name: 'Andaman and Nicobar Islands', code: '35' },
  { name: 'Andhra Pradesh',              code: '28' },
  { name: 'Arunachal Pradesh',           code: '12' },
  { name: 'Assam',                       code: '18' },
  { name: 'Bihar',                       code: '10' },
  { name: 'Chandigarh',                  code: '04' },
  { name: 'Chhattisgarh',                code: '22' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' },
  { name: 'Delhi',                       code: '07' },
  { name: 'Goa',                         code: '30' },
  { name: 'Gujarat',                     code: '24' },
  { name: 'Haryana',                     code: '06' },
  { name: 'Himachal Pradesh',            code: '02' },
  { name: 'Jammu and Kashmir',           code: '01' },
  { name: 'Jharkhand',                   code: '20' },
  { name: 'Karnataka',                   code: '29' },
  { name: 'Kerala',                      code: '32' },
  { name: 'Ladakh',                      code: '38' },
  { name: 'Lakshadweep',                 code: '31' },
  { name: 'Madhya Pradesh',              code: '23' },
  { name: 'Maharashtra',                 code: '27' },
  { name: 'Manipur',                     code: '14' },
  { name: 'Meghalaya',                   code: '17' },
  { name: 'Mizoram',                     code: '15' },
  { name: 'Nagaland',                    code: '13' },
  { name: 'Odisha',                      code: '21' },
  { name: 'Puducherry',                  code: '34' },
  { name: 'Punjab',                      code: '03' },
  { name: 'Rajasthan',                   code: '08' },
  { name: 'Sikkim',                      code: '11' },
  { name: 'Tamil Nadu',                  code: '33' },
  { name: 'Telangana',                   code: '36' },
  { name: 'Tripura',                     code: '16' },
  { name: 'Uttar Pradesh',               code: '09' },
  { name: 'Uttarakhand',                 code: '05' },
  { name: 'West Bengal',                 code: '19' },
];

const GST_RATES = [0, 5, 12, 18, 28];

// ── LocalStorage keys ──────────────────────────────────────────
const LS_INVOICES       = 'gst_invoices';
const LS_COUNTER        = 'gst_invoice_counter';
const LS_SELLER_PROFILE = 'gst_seller_profile';
const LS_IMPORT_QUEUE   = 'gst_import_queue';

// ── Editing state (null = new invoice, string = editing id) ────
let currentEditId = null;
// Cached form data for preview→save flow
let lastPreviewData = null;

// =============================================================
// 1. INIT
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
  populateStateDropdowns();
  wireStateCodeAutoFill();
  wireItemsEvents();
  addRow();                    // start with one blank item row
  setDefaultDates();
  setAutoInvoiceNumber();
  wireLogoUpload();
  createToastContainer();
  applySellerProfile();        // auto-fill seller fields from saved profile

  // Wire seller profile file input
  document.getElementById('seller-profile-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleSellerProfileFile(file);
    e.target.value = '';
  });
});

// =============================================================
// 2. VIEW MANAGER
// =============================================================
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');

  document.getElementById('nav-new').classList.toggle('active',   viewId === 'form-view');
  document.getElementById('nav-saved').classList.toggle('active', viewId === 'saved-view');

  if (viewId === 'saved-view') renderSavedList();
  if (viewId === 'form-view')  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================================
// 3. STATE DROPDOWN POPULATION
// =============================================================
function populateStateDropdowns() {
  const selects = ['seller-state', 'buyer-state', 'place-of-supply'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    INDIAN_STATES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${s.code} – ${s.name}`;
      sel.appendChild(opt);
    });
  });
}

function wireStateCodeAutoFill() {
  document.getElementById('seller-state').addEventListener('change', e => {
    const s = INDIAN_STATES.find(x => x.name === e.target.value);
    document.getElementById('seller-state-code').value = s ? s.code : '';
    applyTaxTypeToItems();
  });
  document.getElementById('buyer-state').addEventListener('change', e => {
    const s = INDIAN_STATES.find(x => x.name === e.target.value);
    document.getElementById('buyer-state-code').value = s ? s.code : '';
    // sync place of supply to buyer state if not yet set
    const pos = document.getElementById('place-of-supply');
    if (!pos.value) pos.value = e.target.value;
    applyTaxTypeToItems();
  });
  document.getElementById('place-of-supply').addEventListener('change', () => applyTaxTypeToItems());
}

// =============================================================
// 4. INVOICE NUMBER + DATES
// =============================================================
function setDefaultDates() {
  const today = new Date();
  const iso   = today.toISOString().slice(0, 10);
  document.getElementById('invoice-date').value = iso;
  // Due date: 30 days later
  const due = new Date(today.getTime() + 30 * 86400000);
  document.getElementById('due-date').value = due.toISOString().slice(0, 10);
}

function setAutoInvoiceNumber() {
  document.getElementById('invoice-number').value = getNextInvoiceNumber(new Date().getFullYear(), false);
}

function getNextInvoiceNumber(year, increment) {
  const counters = JSON.parse(localStorage.getItem(LS_COUNTER) || '{}');
  const current  = counters[year] || 1;
  const formatted = `INV-${year}-${String(current).padStart(3, '0')}`;
  if (increment) {
    counters[year] = current + 1;
    localStorage.setItem(LS_COUNTER, JSON.stringify(counters));
  }
  return formatted;
}

function peekNextInvoiceNumber() {
  return getNextInvoiceNumber(new Date().getFullYear(), false);
}

// =============================================================
// 5. LOGO UPLOAD
// =============================================================
function wireLogoUpload() {
  const input  = document.getElementById('seller-logo');
  const area   = document.getElementById('logo-upload-area');
  const preview = document.getElementById('logo-preview');
  const placeholder = document.getElementById('logo-placeholder');
  const removeBtn   = document.getElementById('btn-remove-logo');

  area.addEventListener('click', (e) => {
    if (e.target !== removeBtn) input.click();
  });

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Logo must be under 2 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      removeBtn.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
}

function removeLogo() {
  document.getElementById('seller-logo').value = '';
  document.getElementById('logo-preview').src = '';
  document.getElementById('logo-preview').style.display = 'none';
  document.getElementById('logo-placeholder').style.display = 'flex';
  document.getElementById('btn-remove-logo').style.display = 'none';
}

// =============================================================
// 6. LINE ITEMS
// =============================================================
let rowCounter = 0;

function wireItemsEvents() {
  const tbody = document.getElementById('items-body');
  tbody.addEventListener('input', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    if (e.target.classList.contains('item-cgst') || e.target.classList.contains('item-igst')) {
      handleTaxMutualExclusion(row, e.target);
    }
    calculateRow(row);
    recalculateAll();
  });
  tbody.addEventListener('change', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    if (e.target.classList.contains('item-cgst') || e.target.classList.contains('item-igst')) {
      handleTaxMutualExclusion(row, e.target);
    }
    calculateRow(row);
    recalculateAll();
  });
}

function handleTaxMutualExclusion(tr, changedEl) {
  const cgstSel = tr.querySelector('.item-cgst');
  const sgstInp = tr.querySelector('.item-sgst');
  const igstSel = tr.querySelector('.item-igst');
  if (!cgstSel || !sgstInp || !igstSel) return;

  const cgstVal = parseFloat(cgstSel.value) || 0;
  const igstVal = parseFloat(igstSel.value) || 0;

  if (changedEl.classList.contains('item-cgst')) {
    // Mirror CGST → SGST
    sgstInp.value = cgstSel.value;
    // Lock IGST when CGST > 0
    if (cgstVal > 0) {
      igstSel.value = '0';
      igstSel.disabled = true;
      igstSel.classList.add('tax-locked');
    } else {
      igstSel.disabled = false;
      igstSel.classList.remove('tax-locked');
    }
  } else if (changedEl.classList.contains('item-igst')) {
    // Lock CGST/SGST when IGST > 0
    if (igstVal > 0) {
      cgstSel.value = '0';
      sgstInp.value = '0';
      cgstSel.disabled = true;
      cgstSel.classList.add('tax-locked');
    } else {
      cgstSel.disabled = false;
      cgstSel.classList.remove('tax-locked');
    }
  }
}

function addRow(data) {
  rowCounter++;
  const tbody = document.getElementById('items-body');
  const tr = document.createElement('tr');
  tr.dataset.rowId = rowCounter;

  const d = data || {};

  const CGST_RATES = ['0', '2.5', '6', '9', '14'];
  const IGST_RATES = ['0', '5', '12', '18', '28'];

  const cgstVal = d.cgst !== undefined ? String(d.cgst) : '0';
  const sgstVal = d.sgst !== undefined ? String(d.sgst) : cgstVal;
  const igstVal = d.igst !== undefined ? String(d.igst) : '0';

  const cgstLocked = parseFloat(igstVal) > 0;
  const igstLocked = parseFloat(cgstVal) > 0;

  const cgstOptions = CGST_RATES.map(r =>
    `<option value="${r}" ${cgstVal === r ? 'selected' : ''}>${r}%</option>`
  ).join('');
  const igstOptions = IGST_RATES.map(r =>
    `<option value="${r}" ${igstVal === r ? 'selected' : ''}>${r}%</option>`
  ).join('');

  tr.innerHTML = `
    <td class="text-center row-num">${tbody.children.length + 1}</td>
    <td><input type="text"   class="item-desc"     placeholder="Item / service description" value="${escHtml(d.description || '')}" /></td>
    <td><input type="text"   class="item-hsn"      placeholder="HSN/SAC"                     value="${escHtml(d.hsn || '')}" /></td>
    <td><input type="number" class="item-qty"      placeholder="1"  min="0"  step="any"       value="${d.qty || ''}" /></td>
    <td><input type="text"   class="item-unit"     placeholder="Nos"                          value="${escHtml(d.unit || '')}" /></td>
    <td><input type="number" class="item-rate"     placeholder="0.00" min="0" step="any"      value="${d.rate || ''}" /></td>
    <td><input type="number" class="item-disc"     placeholder="0"   min="0" max="100" step="any" value="${d.discount || ''}" /></td>
    <td><input type="number" class="item-taxable"  readonly tabindex="-1"                     value="${d.taxableValue || ''}" /></td>
    <td><select class="item-cgst" ${cgstLocked ? 'disabled' : ''}>${cgstOptions}</select></td>
    <td><input  type="text"  class="item-sgst"     readonly tabindex="-1" value="${sgstVal}" /></td>
    <td><select class="item-igst" ${igstLocked ? 'disabled' : ''}>${igstOptions}</select></td>
    <td><input type="number" class="item-amount"   readonly tabindex="-1"                     value="${d.amount || ''}" /></td>
    <td>
      <button type="button" class="btn-remove-row" onclick="removeRow(this)" title="Remove item">✕</button>
    </td>
  `;

  if (cgstLocked) tr.querySelector('.item-cgst').classList.add('tax-locked');
  if (igstLocked) tr.querySelector('.item-igst').classList.add('tax-locked');

  tbody.appendChild(tr);
  renumberRows();
  calculateRow(tr);
  return tr;
}

function removeRow(btn) {
  const tbody = document.getElementById('items-body');
  if (tbody.children.length === 1) { showToast('At least one item is required', 'error'); return; }
  btn.closest('tr').remove();
  renumberRows();
  recalculateAll();
}

function renumberRows() {
  const rows = document.querySelectorAll('#items-body tr');
  rows.forEach((r, i) => {
    const numCell = r.querySelector('.row-num');
    if (numCell) numCell.textContent = i + 1;
  });
}

function calculateRow(tr) {
  const qty      = parseFloat(tr.querySelector('.item-qty')?.value)   || 0;
  const rate     = parseFloat(tr.querySelector('.item-rate')?.value)  || 0;
  const disc     = parseFloat(tr.querySelector('.item-disc')?.value)  || 0;
  const cgstRate = parseFloat(tr.querySelector('.item-cgst')?.value)  || 0;
  const sgstRate = parseFloat(tr.querySelector('.item-sgst')?.value)  || 0;
  const igstRate = parseFloat(tr.querySelector('.item-igst')?.value)  || 0;

  const taxable = qty * rate * (1 - disc / 100);
  const tax     = taxable * ((cgstRate + sgstRate + igstRate) / 100);
  const amount  = taxable + tax;

  const taxableInput = tr.querySelector('.item-taxable');
  const amountInput  = tr.querySelector('.item-amount');
  if (taxableInput) taxableInput.value = taxable > 0 ? taxable.toFixed(2) : '';
  if (amountInput)  amountInput.value  = amount  > 0 ? amount.toFixed(2)  : '';
}

// =============================================================
// 7. TAX CALCULATION + SUMMARY DOM
// =============================================================
function getTaxType() {
  const sellerState = document.getElementById('seller-state').value.trim().toLowerCase();
  const pos         = document.getElementById('place-of-supply').value.trim().toLowerCase();
  if (!sellerState || !pos) return 'intra';
  return sellerState === pos ? 'intra' : 'inter';
}

function calculateTotals() {
  let subtotal = 0, discountAmt = 0, taxableAmt = 0;
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;

  document.querySelectorAll('#items-body tr').forEach(tr => {
    const qty      = parseFloat(tr.querySelector('.item-qty')?.value)   || 0;
    const rate     = parseFloat(tr.querySelector('.item-rate')?.value)  || 0;
    const disc     = parseFloat(tr.querySelector('.item-disc')?.value)  || 0;
    const cgstRate = parseFloat(tr.querySelector('.item-cgst')?.value)  || 0;
    const sgstRate = parseFloat(tr.querySelector('.item-sgst')?.value)  || 0;
    const igstRate = parseFloat(tr.querySelector('.item-igst')?.value)  || 0;

    const lineGross   = qty * rate;
    const lineDisc    = lineGross * (disc / 100);
    const lineTaxable = lineGross - lineDisc;

    subtotal    += lineGross;
    discountAmt += lineDisc;
    taxableAmt  += lineTaxable;
    totalCgst   += lineTaxable * (cgstRate / 100);
    totalSgst   += lineTaxable * (sgstRate / 100);
    totalIgst   += lineTaxable * (igstRate / 100);
  });

  const grandTotal = taxableAmt + totalCgst + totalSgst + totalIgst;
  const hasCgst = totalCgst > 0;
  const hasIgst = totalIgst > 0;
  const taxType = hasCgst && hasIgst ? 'mixed' : hasIgst ? 'inter' : 'intra';
  const totalTax = totalCgst + totalSgst + totalIgst;

  return {
    subtotal, discountAmt, taxableAmt,
    cgst: totalCgst, sgst: totalSgst, igst: totalIgst,
    grandTotal, taxType, totalTax,
  };
}

function recalculateAll() {
  const t = calculateTotals();
  const fmt = n => '₹' + n.toFixed(2);

  document.getElementById('summary-subtotal').textContent  = fmt(t.subtotal);
  document.getElementById('summary-discount').textContent  = '–' + fmt(t.discountAmt);
  document.getElementById('summary-taxable').textContent   = fmt(t.taxableAmt);
  document.getElementById('summary-cgst').textContent      = fmt(t.cgst);
  document.getElementById('summary-sgst').textContent      = fmt(t.sgst);
  document.getElementById('summary-igst').textContent      = fmt(t.igst);
  document.getElementById('summary-grand').textContent     = fmt(t.grandTotal);

  document.getElementById('row-cgst').style.display = t.cgst > 0 ? '' : 'none';
  document.getElementById('row-sgst').style.display = t.sgst > 0 ? '' : 'none';
  document.getElementById('row-igst').style.display = t.igst > 0 ? '' : 'none';

  document.getElementById('amount-words-text').textContent =
    numberToWords(Math.round(t.grandTotal)) + ' Rupees Only';
}

function applyTaxTypeToItems() {
  const taxType = getTaxType();
  document.querySelectorAll('#items-body tr').forEach(tr => {
    const cgstSel = tr.querySelector('.item-cgst');
    const sgstInp = tr.querySelector('.item-sgst');
    const igstSel = tr.querySelector('.item-igst');
    if (!cgstSel || !sgstInp || !igstSel) return;

    const cgstVal = parseFloat(cgstSel.value) || 0;
    const igstVal = parseFloat(igstSel.value) || 0;

    if (taxType === 'inter' && cgstVal > 0 && igstVal === 0) {
      // intra → inter: CGST×2 → IGST
      const igstNew = (cgstVal * 2).toString();
      cgstSel.value = '0'; cgstSel.disabled = false; cgstSel.classList.remove('tax-locked');
      sgstInp.value = '0';
      igstSel.value = igstNew; igstSel.disabled = false; igstSel.classList.remove('tax-locked');
      handleTaxMutualExclusion(tr, igstSel);
    } else if (taxType === 'intra' && igstVal > 0 && cgstVal === 0) {
      // inter → intra: IGST/2 → CGST+SGST
      const cgstNew = (igstVal / 2).toString();
      igstSel.value = '0'; igstSel.disabled = false; igstSel.classList.remove('tax-locked');
      cgstSel.value = cgstNew; cgstSel.disabled = false; cgstSel.classList.remove('tax-locked');
      sgstInp.value = cgstNew;
      handleTaxMutualExclusion(tr, cgstSel);
    }
  });
  recalculateAll();
}

// =============================================================
// 8. AMOUNT IN WORDS (Indian system)
// =============================================================
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
              'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
              'Seventeen', 'Eighteen', 'Nineteen'];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigits(n) {
  if (n === 0) return '';
  if (n < 20)  return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + threeDigits(n % 100) : '');
}

function numberToWords(n) {
  if (n === 0) return 'Zero';
  if (n < 0)   return 'Minus ' + numberToWords(-n);
  let words = '';
  if (n >= 10000000) { words += threeDigits(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
  if (n >= 100000)   { words += threeDigits(Math.floor(n / 100000))   + ' Lakh ';  n %= 100000;   }
  if (n >= 1000)     { words += threeDigits(Math.floor(n / 1000))     + ' Thousand '; n %= 1000;  }
  if (n > 0)         { words += threeDigits(n); }
  return words.trim();
}

// =============================================================
// 9. FORM VALIDATION
// =============================================================
function clearErrors() {
  document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
}

function setError(fieldId, errId, msg) {
  const field = document.getElementById(fieldId);
  const err   = document.getElementById(errId);
  if (field) field.classList.add('field-error');
  if (err)   err.textContent = msg;
  return false;
}

function validateForm() {
  clearErrors();
  let valid = true;

  const req = (fieldId, errId, label) => {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const val = el.value.trim();
    if (!val) { setError(fieldId, errId, `${label} is required.`); valid = false; }
  };

  req('seller-name',            'err-seller-name',           'Business name');
  req('seller-address',         'err-seller-address',        'Address');
  req('seller-state',           'err-seller-state',          'Seller state');
  req('invoice-number',         'err-invoice-number',        'Invoice number');
  req('invoice-date',           'err-invoice-date',          'Invoice date');
  req('buyer-name',             'err-buyer-name',            'Client name');
  req('buyer-billing-address',  'err-buyer-billing-address', 'Billing address');
  req('buyer-state',            'err-buyer-state',           'Buyer state');
  req('place-of-supply',        'err-place-of-supply',       'Place of supply');

  // Validate items
  const rows = document.querySelectorAll('#items-body tr');
  let itemsValid = true;
  rows.forEach(tr => {
    const desc = tr.querySelector('.item-desc')?.value.trim();
    const qty  = parseFloat(tr.querySelector('.item-qty')?.value);
    const rate = parseFloat(tr.querySelector('.item-rate')?.value);
    if (!desc)       { tr.querySelector('.item-desc').classList.add('field-error');  itemsValid = false; }
    if (!(qty > 0))  { tr.querySelector('.item-qty').classList.add('field-error');   itemsValid = false; }
    if (!(rate >= 0)){ tr.querySelector('.item-rate').classList.add('field-error');  itemsValid = false; }
  });
  if (!itemsValid) {
    document.getElementById('err-items').textContent = 'Please fix item errors (description required, qty and rate must be positive).';
    valid = false;
  }

  return valid;
}

// =============================================================
// 10. COLLECT FORM DATA
// =============================================================
function collectFormData() {
  const logoSrc = document.getElementById('logo-preview').src;
  const logoBase64 = logoSrc && !logoSrc.endsWith('/index.html') && logoSrc.startsWith('data:') ? logoSrc : '';

  const items = [];
  document.querySelectorAll('#items-body tr').forEach(tr => {
    items.push({
      description:  tr.querySelector('.item-desc')?.value.trim()    || '',
      hsn:          tr.querySelector('.item-hsn')?.value.trim()     || '',
      qty:          tr.querySelector('.item-qty')?.value.trim()     || '',
      unit:         tr.querySelector('.item-unit')?.value.trim()    || '',
      rate:         tr.querySelector('.item-rate')?.value.trim()    || '',
      discount:     tr.querySelector('.item-disc')?.value.trim()    || '0',
      taxableValue: tr.querySelector('.item-taxable')?.value        || '0',
      cgst:         tr.querySelector('.item-cgst')?.value           || '0',
      sgst:         tr.querySelector('.item-sgst')?.value           || '0',
      igst:         tr.querySelector('.item-igst')?.value           || '0',
      amount:       tr.querySelector('.item-amount')?.value         || '0',
    });
  });

  const totals = calculateTotals();

  return {
    seller: {
      name:       document.getElementById('seller-name').value.trim(),
      address:    document.getElementById('seller-address').value.trim(),
      email:      document.getElementById('seller-email').value.trim(),
      phone:      document.getElementById('seller-phone').value.trim(),
      gstin:      document.getElementById('seller-gstin').value.trim(),
      pan:        document.getElementById('seller-pan').value.trim(),
      state:      document.getElementById('seller-state').value,
      stateCode:  document.getElementById('seller-state-code').value,
      logoBase64,
    },
    invoice: {
      number:        document.getElementById('invoice-number').value.trim(),
      date:          document.getElementById('invoice-date').value,
      dueDate:       document.getElementById('due-date').value,
      paymentMode:   document.getElementById('payment-mode').value,
      reverseCharge: document.getElementById('reverse-charge').value,
    },
    buyer: {
      name:            document.getElementById('buyer-name').value.trim(),
      billingAddress:  document.getElementById('buyer-billing-address').value.trim(),
      shippingAddress: document.getElementById('buyer-shipping-address').value.trim(),
      gstin:           document.getElementById('buyer-gstin').value.trim(),
      state:           document.getElementById('buyer-state').value,
      stateCode:       document.getElementById('buyer-state-code').value,
      placeOfSupply:   document.getElementById('place-of-supply').value,
    },
    items,
    totals: {
      subtotal:    totals.subtotal.toFixed(2),
      discountAmt: totals.discountAmt.toFixed(2),
      taxableAmt:  totals.taxableAmt.toFixed(2),
      cgst:        totals.cgst.toFixed(2),
      sgst:        totals.sgst.toFixed(2),
      igst:        totals.igst.toFixed(2),
      grandTotal:  totals.grandTotal.toFixed(2),
      taxType:     totals.taxType,
    },
    additional: {
      amountInWords: numberToWords(Math.round(totals.grandTotal)) + ' Rupees Only',
      terms:         document.getElementById('terms').value.trim(),
      bankName:      document.getElementById('bank-name').value.trim(),
      accountNo:     document.getElementById('account-no').value.trim(),
      ifsc:          document.getElementById('ifsc').value.trim(),
      branch:        document.getElementById('branch').value.trim(),
      upiId:         document.getElementById('upi-id').value.trim(),
      notes:         document.getElementById('notes').value.trim(),
      signatory:     document.getElementById('signatory').value.trim(),
    },
  };
}

// =============================================================
// 11. PREVIEW RENDERER
// =============================================================
function previewInvoice() {
  if (!validateForm()) {
    showToast('Please fix the highlighted errors before previewing.', 'error');
    // scroll to first error
    const firstErr = document.querySelector('.field-error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const data = collectFormData();
  lastPreviewData = data;
  renderPreview(data);
  showView('preview-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPreview(data) {
  document.getElementById('invoice-page').innerHTML = buildPreviewHTML(data);
}

function buildPreviewHTML(data) {
  const { seller, invoice, buyer, items, totals, additional } = data;
  const fmtDate = (d) => {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };
  const fmtAmt = (v) => '₹' + parseFloat(v).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Header
  const logoHTML = seller.logoBase64
    ? `<div class="inv-logo"><img src="${seller.logoBase64}" alt="Logo" /></div>`
    : seller.name
    ? `<div class="inv-logo"><div class="inv-company-name-header">${escHtml(seller.name)}</div></div>`
    : `<div class="inv-logo"></div>`;

  // Seller details block
  const sellerHTML = `
    <div class="inv-party-block">
      <span class="inv-party-title">From (Seller)</span>
      <div class="inv-party-name">${escHtml(seller.name)}</div>
      <div class="inv-party-detail">
        ${seller.address ? escHtml(seller.address) + '<br/>' : ''}
        ${seller.email   ? 'Email: ' + escHtml(seller.email) + '<br/>' : ''}
        ${seller.phone   ? 'Phone: ' + escHtml(seller.phone) + '<br/>' : ''}
        ${seller.gstin   ? 'GSTIN: <strong>' + escHtml(seller.gstin) + '</strong><br/>' : ''}
        ${seller.pan     ? 'PAN: '   + escHtml(seller.pan) + '<br/>' : ''}
        ${seller.state   ? 'State: ' + escHtml(seller.state) + ' (' + escHtml(seller.stateCode) + ')' : ''}
      </div>
    </div>`;

  // Buyer details block
  const posCode = buyer.placeOfSupply === buyer.state ? buyer.stateCode : '';
  const buyerHTML = `
    <div class="inv-party-block">
      <span class="inv-party-title">To (Buyer)</span>
      <div class="inv-party-name">${escHtml(buyer.name)}</div>
      <div class="inv-party-detail">
        ${buyer.billingAddress ? 'Billing: ' + escHtml(buyer.billingAddress) + '<br/>' : ''}
        ${buyer.shippingAddress ? 'Shipping: ' + escHtml(buyer.shippingAddress) + '<br/>' : ''}
        ${buyer.gstin ? 'GSTIN: <strong>' + escHtml(buyer.gstin) + '</strong><br/>' : ''}
        ${buyer.state ? 'State: ' + escHtml(buyer.state) + ' (' + escHtml(buyer.stateCode) + ')<br/>' : ''}
        ${buyer.placeOfSupply ? 'Place of Supply: ' + escHtml(buyer.placeOfSupply) + (posCode ? ' (' + posCode + ')' : '') : ''}
      </div>
    </div>`;

  // Items rows
  const itemRows = items.map((item, i) => {
    const cgst = parseFloat(item.cgst) || 0;
    const igst = parseFloat(item.igst) || 0;
    const totalTaxRate = cgst + (parseFloat(item.sgst) || 0) + igst;
    const discPct = parseFloat(item.discount) || 0;
    const discAmt = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0) * (discPct / 100);
    const discCell = discPct > 0
      ? `${fmtAmt(discAmt)}<br/><small style="color:#888;">(${discPct}%)</small>`
      : '—';
    const taxCell = totalTaxRate > 0 ? `${totalTaxRate}%` : '—';
    return `
    <tr>
      <td class="text-center">${i + 1}</td>
      <td>${escHtml(item.description)}</td>
      <td class="text-center">${escHtml(item.hsn)}</td>
      <td class="text-right">${escHtml(item.qty)}</td>
      <td class="text-center">${escHtml(item.unit)}</td>
      <td class="text-right">${fmtAmt(item.rate)}</td>
      <td class="text-right">${discCell}</td>
      <td class="text-right">${fmtAmt(item.taxableValue)}</td>
      <td class="text-center">${taxCell}</td>
      <td class="text-right">${fmtAmt(item.amount)}</td>
    </tr>`;
  }).join('');

  // Tax rows — show only non-zero amounts
  const taxTypeLabel = totals.taxType === 'inter'
    ? 'Interstate supply — IGST applicable'
    : totals.taxType === 'mixed'
    ? 'Mixed supply — CGST+SGST & IGST'
    : 'Intrastate supply — CGST+SGST applicable';

  const taxRowsHTML = [
    parseFloat(totals.cgst) > 0 ? `<tr><td class="total-label">CGST</td><td class="total-value">${fmtAmt(totals.cgst)}</td></tr>` : '',
    parseFloat(totals.sgst) > 0 ? `<tr><td class="total-label">SGST</td><td class="total-value">${fmtAmt(totals.sgst)}</td></tr>` : '',
    parseFloat(totals.igst) > 0 ? `<tr><td class="total-label">IGST</td><td class="total-value">${fmtAmt(totals.igst)}</td></tr>` : '',
    `<tr class="tax-type-row"><td colspan="2">${taxTypeLabel}</td></tr>`,
  ].join('');

  // Bank details
  const bankLines = [
    seller.name    ? `For: ${seller.name}`    : '',
    additional.bankName  ? `Bank: ${escHtml(additional.bankName)}`   : '',
    additional.accountNo ? `A/C No.: ${escHtml(additional.accountNo)}` : '',
    additional.ifsc      ? `IFSC: ${escHtml(additional.ifsc)}`       : '',
    additional.branch    ? `Branch: ${escHtml(additional.branch)}`   : '',
    additional.upiId     ? `UPI ID: ${escHtml(additional.upiId)}`    : '',
  ].filter(Boolean);

  const hasBankDetails = additional.bankName || additional.accountNo || additional.ifsc || additional.upiId;

  const bankHTML = hasBankDetails
    ? `<div class="inv-bank-block">
        <strong>Bank / Payment Details</strong>
        ${bankLines.slice(1).map(l => `<p>${l}</p>`).join('')}
       </div>`
    : `<div class="inv-bank-block"></div>`;

  const signatoryHTML = `
    <div class="inv-signatory-block">
      <strong>For ${escHtml(seller.name)}</strong>
      <div class="inv-signature-space"></div>
      <div class="inv-signature-line"></div>
      ${additional.signatory ? `<span class="signatory-name">${escHtml(additional.signatory)}</span>` : ''}
      <span class="signatory-role">Authorized Signatory</span>
    </div>`;

  const termsHTML = additional.terms
    ? `<div class="inv-notes-section">
        <span class="inv-section-label">Terms &amp; Conditions</span>
        <div class="inv-notes-text">${escHtml(additional.terms)}</div>
       </div>` : '';

  const notesHTML = additional.notes
    ? `<div class="inv-notes-section">
        <span class="inv-section-label">Notes</span>
        <div class="inv-notes-text">${escHtml(additional.notes)}</div>
       </div>` : '';

  return `
    <!-- Header -->
    <div class="inv-header">
      ${logoHTML}
      <div class="inv-title-block">
        <span class="inv-title">TAX INVOICE</span>
        <span class="inv-number">Invoice No: <strong>${escHtml(invoice.number)}</strong></span>
        ${invoice.reverseCharge === 'Yes' ? '<span style="font-size:8.5pt;color:#dc2626;font-weight:700;">⚠ Reverse Charge Applicable</span>' : ''}
      </div>
    </div>

    <!-- Invoice Meta -->
    <div class="inv-meta-row">
      <div class="inv-meta-item">
        <span>Invoice Date</span>
        <strong>${fmtDate(invoice.date)}</strong>
      </div>
      ${invoice.dueDate ? `<div class="inv-meta-item"><span>Due Date</span><strong>${fmtDate(invoice.dueDate)}</strong></div>` : ''}
      ${invoice.paymentMode ? `<div class="inv-meta-item"><span>Payment Mode</span><strong>${escHtml(invoice.paymentMode)}</strong></div>` : ''}
    </div>

    <!-- Parties -->
    <div class="inv-parties">
      ${sellerHTML}
      ${buyerHTML}
    </div>

    <!-- Items Table -->
    <table class="inv-items-table">
      <thead>
        <tr>
          <th style="width:28px">#</th>
          <th>Description</th>
          <th class="text-center" style="width:64px">HSN/SAC</th>
          <th class="text-center" style="width:38px">Qty</th>
          <th class="text-center" style="width:44px">Unit</th>
          <th class="text-right"  style="width:76px">Rate (₹)</th>
          <th class="text-right"  style="width:82px">Discount</th>
          <th class="text-right"  style="width:84px">Taxable (₹)</th>
          <th class="text-center" style="width:52px">GST%</th>
          <th class="text-right"  style="width:86px">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- Totals -->
    <div class="inv-totals-wrapper">
      <table class="inv-totals-table">
        <tr><td class="total-label">Subtotal</td><td class="total-value">${fmtAmt(totals.subtotal)}</td></tr>
        <tr><td class="total-label">Discount</td><td class="total-value">–${fmtAmt(totals.discountAmt)}</td></tr>
        <tr><td class="total-label">Taxable Amount</td><td class="total-value">${fmtAmt(totals.taxableAmt)}</td></tr>
        ${taxRowsHTML}
        <tr class="grand-row"><td class="total-label">Grand Total</td><td class="total-value">${fmtAmt(totals.grandTotal)}</td></tr>
      </table>
    </div>

    <!-- Amount in Words -->
    <div class="inv-amount-words">
      <strong>Amount in Words:</strong> ${escHtml(additional.amountInWords)}
    </div>

    ${termsHTML}
    ${notesHTML}

    <!-- Bank + Signatory -->
    <div class="inv-bank-signatory">
      ${bankHTML}
      ${signatoryHTML}
    </div>

    <!-- Footer -->
    <div class="inv-footer">
      This is a computer-generated invoice. &nbsp;|&nbsp; Invoice No: ${escHtml(invoice.number)} &nbsp;|&nbsp; Generated on ${new Date().toLocaleDateString('en-IN')}
    </div>
  `;
}

// =============================================================
// 12. PDF DOWNLOAD
// =============================================================
function downloadPDF() {
  const element = document.getElementById('invoice-page');
  if (!element) return;
  const invoiceNum = lastPreviewData?.invoice?.number || 'invoice';

  // Add compact class: shrinks padding/spacing/fonts so all content fits one A4 page.
  // margin:0 means html2pdf adds no extra whitespace around the element.
  document.body.classList.add('pdf-rendering');

  const opt = {
    margin:       0,
    filename:     `${invoiceNum}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] },
  };

  const cleanup = () => document.body.classList.remove('pdf-rendering');

  showToast('Generating PDF…', 'info');
  html2pdf().set(opt).from(element).save().then(() => {
    cleanup();
    showToast('PDF downloaded!', 'success');
  }).catch(() => {
    cleanup();
    showToast('PDF generation failed. Try printing as PDF instead.', 'error');
  });
}

// =============================================================
// 13. LOCALSTORAGE CRUD
// =============================================================
function loadAllInvoices() {
  return JSON.parse(localStorage.getItem(LS_INVOICES) || '[]');
}

function saveInvoiceRecord(record) {
  const all = loadAllInvoices();
  const idx = all.findIndex(r => r.id === record.id);
  if (idx !== -1) {
    all[idx] = record;
  } else {
    all.unshift(record);       // newest first
  }
  localStorage.setItem(LS_INVOICES, JSON.stringify(all));
}

function loadInvoiceRecord(id) {
  return loadAllInvoices().find(r => r.id === id) || null;
}

function deleteInvoiceRecord(id) {
  const all = loadAllInvoices().filter(r => r.id !== id);
  localStorage.setItem(LS_INVOICES, JSON.stringify(all));
}

// =============================================================
// 14. SAVE INVOICE (from form & from preview toolbar)
// =============================================================
function saveInvoiceFromForm() {
  if (!validateForm()) {
    showToast('Please fix errors before saving.', 'error');
    document.querySelector('.field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const data = collectFormData();
  _persistInvoice(data);
}

function saveInvoiceFromPreview() {
  if (!lastPreviewData) { showToast('Nothing to save.', 'error'); return; }
  _persistInvoice(lastPreviewData);
}

function _persistInvoice(data) {
  let id = currentEditId;
  let isNew = false;

  if (!id) {
    id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    isNew = true;
  }

  const record = {
    id,
    invoiceNumber: data.invoice.number,
    invoiceDate:   data.invoice.date,
    clientName:    data.buyer.name,
    grandTotal:    parseFloat(data.totals.grandTotal),
    data,
  };

  saveInvoiceRecord(record);

  if (isNew) {
    // bump counter only when creating new (not editing)
    const year = new Date().getFullYear();
    const counters = JSON.parse(localStorage.getItem(LS_COUNTER) || '{}');
    const currentNum = counters[year] || 1;
    // Increment only if the saved invoice number matches the auto-generated pattern
    const expectedBase = `INV-${year}-`;
    if (data.invoice.number.startsWith(expectedBase)) {
      counters[year] = currentNum + 1;
      localStorage.setItem(LS_COUNTER, JSON.stringify(counters));
    }
    currentEditId = id;
  }

  showToast(`Invoice ${data.invoice.number} saved!`, 'success');
}

// =============================================================
// 15. SAVED INVOICES UI
// =============================================================
function renderSavedList() {
  const wrapper = document.getElementById('saved-list-wrapper');
  const invoices = loadAllInvoices();

  if (!invoices.length) {
    wrapper.innerHTML = `
      <div class="saved-empty">
        <svg width="48" height="48" fill="none" viewBox="0 0 24 24"><path d="M9 12h6M9 16h3M6 2h9l4 4v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <p>No saved invoices yet.</p>
        <button class="btn btn-primary" onclick="showView('form-view')">+ Create Your First Invoice</button>
      </div>`;
    return;
  }

  const rows = invoices.map(r => `
    <tr>
      <td class="inv-no">${escHtml(r.invoiceNumber)}</td>
      <td>${fmtDisplayDate(r.invoiceDate)}</td>
      <td>${escHtml(r.clientName)}</td>
      <td class="inv-amt">${'₹ ' + r.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td>
        <div class="saved-actions">
          <button class="btn btn-outline btn-sm" onclick="viewSavedInvoice('${r.id}')">View</button>
          <button class="btn btn-secondary btn-sm" onclick="editSavedInvoice('${r.id}')">Edit</button>
          <button class="btn btn-primary btn-sm" onclick="downloadSavedPDF('${r.id}')">PDF</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteInvoice('${r.id}')">Delete</button>
        </div>
      </td>
    </tr>`).join('');

  wrapper.innerHTML = `
    <div class="saved-table-wrapper">
      <table class="saved-table">
        <thead>
          <tr>
            <th>Invoice No.</th>
            <th>Date</th>
            <th>Client</th>
            <th>Amount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function viewSavedInvoice(id) {
  const record = loadInvoiceRecord(id);
  if (!record) return;
  lastPreviewData = record.data;
  renderPreview(record.data);
  showView('preview-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function editSavedInvoice(id) {
  const record = loadInvoiceRecord(id);
  if (!record) return;
  currentEditId = id;
  populateForm(record.data);
  showView('form-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function downloadSavedPDF(id) {
  const record = loadInvoiceRecord(id);
  if (!record) return;
  lastPreviewData = record.data;
  renderPreview(record.data);
  // Give the DOM a moment to render before capturing
  setTimeout(() => downloadPDF(), 300);
}

function confirmDeleteInvoice(id) {
  const record = loadInvoiceRecord(id);
  if (!record) return;
  if (!confirm(`Delete invoice "${record.invoiceNumber}" for "${record.clientName}"?\nThis cannot be undone.`)) return;
  deleteInvoiceRecord(id);
  showToast('Invoice deleted.', 'info');
  renderSavedList();
}

// =============================================================
// 16. POPULATE FORM (for edit)
// =============================================================
function populateForm(data) {
  const { seller, invoice, buyer, items, additional } = data;

  // Seller
  document.getElementById('seller-name').value    = seller.name    || '';
  document.getElementById('seller-address').value = seller.address || '';
  document.getElementById('seller-email').value   = seller.email   || '';
  document.getElementById('seller-phone').value   = seller.phone   || '';
  document.getElementById('seller-gstin').value   = seller.gstin   || '';
  document.getElementById('seller-pan').value     = seller.pan     || '';
  document.getElementById('seller-state').value   = seller.state   || '';
  document.getElementById('seller-state-code').value = seller.stateCode || '';

  // Logo
  if (seller.logoBase64) {
    document.getElementById('logo-preview').src          = seller.logoBase64;
    document.getElementById('logo-preview').style.display = 'block';
    document.getElementById('logo-placeholder').style.display = 'none';
    document.getElementById('btn-remove-logo').style.display  = 'block';
  }

  // Invoice
  document.getElementById('invoice-number').value  = invoice.number      || '';
  document.getElementById('invoice-date').value     = invoice.date        || '';
  document.getElementById('due-date').value         = invoice.dueDate     || '';
  document.getElementById('payment-mode').value     = invoice.paymentMode || '';
  document.getElementById('reverse-charge').value   = invoice.reverseCharge || 'No';

  // Buyer
  document.getElementById('buyer-name').value             = buyer.name            || '';
  document.getElementById('buyer-billing-address').value  = buyer.billingAddress  || '';
  document.getElementById('buyer-shipping-address').value = buyer.shippingAddress || '';
  document.getElementById('buyer-gstin').value            = buyer.gstin           || '';
  document.getElementById('buyer-state').value            = buyer.state           || '';
  document.getElementById('buyer-state-code').value       = buyer.stateCode       || '';
  document.getElementById('place-of-supply').value        = buyer.placeOfSupply   || '';

  // Items — migrate old gstRate-only records to cgst/sgst/igst
  const tbody = document.getElementById('items-body');
  tbody.innerHTML = '';
  rowCounter = 0;
  const savedTaxType = data.totals?.taxType || 'intra';
  items.forEach(item => {
    if (item.cgst === undefined && item.igst === undefined && item.gstRate !== undefined) {
      const rate = parseFloat(item.gstRate) || 0;
      if (savedTaxType === 'inter') {
        item = { ...item, cgst: 0, sgst: 0, igst: rate };
      } else {
        item = { ...item, cgst: rate / 2, sgst: rate / 2, igst: 0 };
      }
    }
    addRow(item);
  });

  // Additional
  document.getElementById('terms').value      = additional.terms     || '';
  document.getElementById('bank-name').value  = additional.bankName  || '';
  document.getElementById('account-no').value = additional.accountNo || '';
  document.getElementById('ifsc').value        = additional.ifsc      || '';
  document.getElementById('branch').value      = additional.branch    || '';
  document.getElementById('upi-id').value      = additional.upiId     || '';
  document.getElementById('notes').value       = additional.notes     || '';
  document.getElementById('signatory').value   = additional.signatory || '';

  clearErrors();
  recalculateAll();
}

// =============================================================
// 17. CLEAR FORM
// =============================================================
function clearForm() {
  if (!confirm('Clear the form? All unsaved changes will be lost.')) return;

  currentEditId    = null;
  lastPreviewData  = null;

  // Reset all simple inputs / selects / textareas
  document.querySelectorAll('#form-view input:not([type=file]), #form-view select, #form-view textarea')
    .forEach(el => {
      if (el.type === 'checkbox') return;
      el.value = '';
    });

  // Remove logo
  removeLogo();

  // Reset reverse-charge default
  document.getElementById('reverse-charge').value = 'No';

  // Reset items table
  const tbody = document.getElementById('items-body');
  tbody.innerHTML = '';
  rowCounter = 0;
  addRow();

  // Reset defaults
  setDefaultDates();
  setAutoInvoiceNumber();
  clearErrors();
  recalculateAll();
  applySellerProfile();   // re-fill seller fields from saved profile

  showToast('Form cleared.', 'info');
}

// =============================================================
// 18. TOAST NOTIFICATIONS
// =============================================================
function createToastContainer() {
  if (!document.getElementById('toast-container')) {
    const div = document.createElement('div');
    div.id = 'toast-container';
    document.body.appendChild(div);
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// =============================================================
// 19. UTILITIES
// =============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDisplayDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// =============================================================
// 20. SELLER PROFILE MODULE
// =============================================================

function triggerSellerProfileImport() {
  document.getElementById('seller-profile-input').click();
}

// ── Apply stored profile to seller + bank/additional fields ──
function applySellerProfile() {
  const profile = JSON.parse(localStorage.getItem(LS_SELLER_PROFILE) || 'null');
  if (!profile) { updateSellerProfileBadge(null); return; }

  // Seller fields
  document.getElementById('seller-name').value    = profile.name      || '';
  document.getElementById('seller-address').value = profile.address   || '';
  document.getElementById('seller-email').value   = profile.email     || '';
  document.getElementById('seller-phone').value   = profile.phone     || '';
  document.getElementById('seller-gstin').value   = profile.gstin     || '';
  document.getElementById('seller-pan').value     = profile.pan       || '';
  document.getElementById('seller-state').value   = profile.state     || '';
  document.getElementById('seller-state-code').value = profile.stateCode || '';

  // Logo
  if (profile.logoBase64) {
    document.getElementById('logo-preview').src            = profile.logoBase64;
    document.getElementById('logo-preview').style.display  = 'block';
    document.getElementById('logo-placeholder').style.display = 'none';
    document.getElementById('btn-remove-logo').style.display  = 'block';
  }

  // Bank + additional fields
  document.getElementById('bank-name').value  = profile.bankName  || '';
  document.getElementById('account-no').value = profile.accountNo || '';
  document.getElementById('ifsc').value        = profile.ifsc      || '';
  document.getElementById('branch').value      = profile.branch    || '';
  document.getElementById('upi-id').value      = profile.upiId     || '';
  document.getElementById('signatory').value   = profile.signatory || '';
  document.getElementById('terms').value       = profile.terms     || '';

  updateSellerProfileBadge(profile.name);
}

// ── Save current form seller fields as profile ────────────────
function saveSellerProfileFromForm() {
  const nameVal = document.getElementById('seller-name').value.trim();
  if (!nameVal) {
    showToast('Enter a Business Name before saving the profile.', 'error');
    document.getElementById('seller-name').focus();
    return;
  }

  const logoSrc = document.getElementById('logo-preview').src;
  const logoBase64 = logoSrc && logoSrc.startsWith('data:') ? logoSrc : '';

  const profile = {
    name:      nameVal,
    address:   document.getElementById('seller-address').value.trim(),
    email:     document.getElementById('seller-email').value.trim(),
    phone:     document.getElementById('seller-phone').value.trim(),
    gstin:     document.getElementById('seller-gstin').value.trim(),
    pan:       document.getElementById('seller-pan').value.trim(),
    state:     document.getElementById('seller-state').value,
    stateCode: document.getElementById('seller-state-code').value,
    logoBase64,
    bankName:  document.getElementById('bank-name').value.trim(),
    accountNo: document.getElementById('account-no').value.trim(),
    ifsc:      document.getElementById('ifsc').value.trim(),
    branch:    document.getElementById('branch').value.trim(),
    upiId:     document.getElementById('upi-id').value.trim(),
    signatory: document.getElementById('signatory').value.trim(),
    terms:     document.getElementById('terms').value.trim(),
  };

  localStorage.setItem(LS_SELLER_PROFILE, JSON.stringify(profile));
  updateSellerProfileBadge(profile.name);
  showToast(`Profile saved for “${profile.name}” — auto-fills every new invoice.`, 'success');
}

// ── Clear stored profile ──────────────────────────────────────
function clearSellerProfile() {
  if (!confirm('Remove the saved seller profile?\nSeller fields will no longer auto-fill.')) return;
  localStorage.removeItem(LS_SELLER_PROFILE);
  updateSellerProfileBadge(null);
  showToast('Seller profile removed.', 'info');
}

// ── Badge visibility ──────────────────────────────────────────
function updateSellerProfileBadge(name) {
  const badge    = document.getElementById('seller-profile-badge');
  const clearBtn = document.getElementById('btn-clear-profile');
  if (name) {
    badge.textContent = name;
    badge.style.display = 'inline-flex';
    if (clearBtn) clearBtn.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
  }
}

// ── Parse profile from Excel / CSV file ──────────────────────
function handleSellerProfileFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    showToast('Use .xlsx, .xls, or .csv for the profile file.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      if (typeof XLSX === 'undefined') {
        showToast('SheetJS not loaded. Check your internet connection.', 'error');
        return;
      }
      const type     = ext === 'csv' ? 'string' : 'arraybuffer';
      const workbook = XLSX.read(ev.target.result, { type });
      const ws       = workbook.Sheets[workbook.SheetNames[0]];
      const rows     = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rows.length < 2) {
        showToast('Profile file must have a header row + one data row.', 'error');
        return;
      }

      const headers = rows[0].map(h => String(h).trim().toLowerCase());
      const data    = rows[1];

      // Flexible column lookup by any of the given alias names
      const get = (...aliases) => {
        for (const alias of aliases) {
          const idx = headers.indexOf(alias.trim().toLowerCase());
          if (idx !== -1 && String(data[idx] || '').trim()) return String(data[idx]).trim();
        }
        return '';
      };

      const stateName  = get('state', 'business state', 'seller state');
      const stateMatch = INDIAN_STATES.find(
        s => s.name.toLowerCase() === stateName.toLowerCase() || s.code === stateName
      );

      const profile = {
        name:      get('business name', 'company name', 'name', 'seller name'),
        address:   get('address', 'business address', 'registered address'),
        email:     get('email', 'email address', 'business email'),
        phone:     get('phone', 'mobile', 'contact', 'phone number'),
        gstin:     get('gstin', 'gst no', 'gst number', 'gstin no'),
        pan:       get('pan', 'pan number', 'pan no'),
        state:     stateMatch ? stateMatch.name : stateName,
        stateCode: stateMatch ? stateMatch.code : '',
        logoBase64: '',
        bankName:  get('bank name', 'bank'),
        accountNo: get('account number', 'account no', 'account', 'acc no'),
        ifsc:      get('ifsc code', 'ifsc'),
        branch:    get('branch', 'bank branch'),
        upiId:     get('upi id', 'upi', 'upi id'),
        signatory: get('authorized signatory', 'signatory', 'authorised signatory'),
        terms:     get('terms & conditions', 'terms and conditions', 'terms'),
      };

      if (!profile.name) {
        showToast('Business Name column not found. Please check the file headers.', 'error');
        return;
      }

      localStorage.setItem(LS_SELLER_PROFILE, JSON.stringify(profile));
      applySellerProfile();
      showToast(`Profile loaded: “${profile.name}” — will auto-fill every new invoice.`, 'success');
    } catch (err) {
      console.error('Seller profile import error:', err);
      showToast('Could not parse the file: ' + err.message, 'error');
    }
  };
  reader.onerror = () => showToast('Failed to read the file.', 'error');
  if (ext === 'csv') reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

// ── Download seller profile Excel template ────────────────────
function downloadSellerTemplate() {
  if (typeof XLSX === 'undefined') {
    showToast('SheetJS not loaded — cannot generate template.', 'error');
    return;
  }

  const headers = [
    'Business Name', 'GSTIN', 'Address', 'Email', 'Phone', 'PAN', 'State',
    'Bank Name', 'Account Number', 'IFSC Code', 'Branch', 'UPI ID',
    'Authorized Signatory', 'Terms & Conditions',
  ];

  const sample = [
    'Acme Pvt. Ltd.',
    '27AAPFU0939F1ZV',
    '123, MG Road, Andheri West, Mumbai – 400058',
    'billing@acme.com',
    '+91 98765 43210',
    'AAPFU0939F',
    'Maharashtra',
    'HDFC Bank',
    '00123456789012',
    'HDFC0001234',
    'Andheri West, Mumbai',
    'acme@ybl',
    'Ramesh Kumar',
    'Payment due within 30 days. Goods once sold will not be taken back. Subject to Mumbai jurisdiction.',
  ];

  const colWidths = [22, 18, 36, 26, 16, 12, 16, 16, 18, 12, 24, 16, 20, 44];

  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Business Profile');
  XLSX.writeFile(wb, 'seller-profile-template.xlsx');
  showToast('Template downloaded: seller-profile-template.xlsx', 'success');
}

// =============================================================
// 21. EXCEL IMPORT MODULE (invoice rows)
// =============================================================

let importedInvoices  = [];   // parsed invoice objects from the Excel
let importCurrentIdx  = -1;   // last loaded index (for highlight)
let importLoadedSet   = new Set(); // indices already loaded this session

// ── persist / restore import queue ───────────────────────────
function saveImportQueue() {
  localStorage.setItem(LS_IMPORT_QUEUE, JSON.stringify({
    invoices: importedInvoices,
    loaded:   [...importLoadedSet],
  }));
}

function restoreImportQueue() {
  try {
    const raw = localStorage.getItem(LS_IMPORT_QUEUE);
    if (!raw) return;
    const { invoices, loaded } = JSON.parse(raw);
    if (Array.isArray(invoices) && invoices.length) {
      importedInvoices = invoices;
      importLoadedSet  = new Set(Array.isArray(loaded) ? loaded : []);
    }
  } catch (_) { /* ignore corrupt data */ }
}

function clearImportQueue() {
  if (!confirm('Clear the imported invoice list? You will need to re-import the Excel file.')) return;
  importedInvoices = [];
  importCurrentIdx = -1;
  importLoadedSet  = new Set();
  localStorage.removeItem(LS_IMPORT_QUEUE);
  document.getElementById('import-preview').innerHTML = '';
  // reset file input so same file can be re-selected
  const fi = document.getElementById('import-file-input');
  if (fi) fi.value = '';
  showToast('Import queue cleared.', 'info');
}

// ── Open / Close modal ────────────────────────────────────────
function openHelpModal() {
  document.getElementById('help-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeHelpModal() {
  document.getElementById('help-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function openImportModal() {
  document.getElementById('import-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  // Restore persisted queue if in-memory list is empty
  if (!importedInvoices.length) restoreImportQueue();
  if (importedInvoices.length) renderImportPreview();
}

function closeImportModal() {
  document.getElementById('import-modal').classList.remove('open');
  document.body.style.overflow = '';
  // Intentionally do NOT clear importedInvoices — list persists until user clears it
}

// Close on overlay click (outside the modal box)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('help-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('help-modal')) closeHelpModal();
  });

  const overlay = document.getElementById('import-modal');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeImportModal();
  });

  // Wire file input change
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImportFile(file);
  });

  // Drag & drop wiring
  const dropzone = document.getElementById('import-dropzone');
  dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop',      (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  });
});

// ── File handler ──────────────────────────────────────────────
function handleImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    showToast('Unsupported file type. Please upload .xlsx, .xls, or .csv', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('File is too large (max 10 MB).', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      if (ext === 'csv') {
        parseWorkbook(ev.target.result, 'string');
      } else {
        parseWorkbook(ev.target.result, 'arraybuffer');
      }
    } catch (err) {
      console.error('Import error:', err);
      showToast('Could not parse file: ' + err.message, 'error');
    }
  };
  reader.onerror = () => showToast('Failed to read the file.', 'error');

  if (ext === 'csv') {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

// ── Parse workbook via SheetJS ────────────────────────────────
function parseWorkbook(data, type) {
  if (typeof XLSX === 'undefined') {
    showToast('SheetJS library not loaded. Check your internet connection.', 'error');
    return;
  }

  const workbook = XLSX.read(data, { type, cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // raw:true so Date objects come through; defval keeps empty cells as ''
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });

  if (rows.length < 2) {
    showToast('File is empty or has only a header row.', 'error');
    return;
  }

  const headerRow = rows[0].map(h => String(h).trim().toLowerCase());
  const colMap    = detectImportColumns(headerRow);
  const dataRows  = rows.slice(1).filter(row => row.some(cell => String(cell).trim() !== ''));

  if (!dataRows.length) {
    showToast('No data rows found in the file.', 'error');
    return;
  }

  importedInvoices = groupRowsIntoInvoices(dataRows, colMap);

  if (!importedInvoices.length) {
    showToast('No valid invoices could be parsed. Check the file format.', 'error');
    return;
  }

  importCurrentIdx = -1;
  importLoadedSet  = new Set();
  saveImportQueue();
  renderImportPreview();
  showToast(`${importedInvoices.length} invoice(s) found in the file.`, 'success');
}

// ── Column auto-detection ─────────────────────────────────────
function detectImportColumns(headers) {
  const mappings = {
    group:         ['invoice group', 'group', 'invoice no', 'inv no', 'invoice number', 'inv #', 'inv#', 'ref'],
    clientName:    ['client name', 'buyer name', 'customer name', 'client', 'buyer', 'customer', 'bill to'],
    clientAddress: ['client address', 'billing address', 'address', 'buyer address', 'bill address'],
    clientGstin:   ['client gstin', 'buyer gstin', 'gstin', 'gst no', 'gstin/uin'],
    clientState:   ['client state', 'buyer state', 'state'],
    placeOfSupply: ['place of supply', 'pos', 'supply state', 'place'],
    invoiceDate:   ['invoice date', 'date', 'inv date', 'bill date'],
    dueDate:       ['due date', 'payment due', 'due'],
    paymentMode:   ['payment mode', 'payment', 'mode', 'pay mode'],
    description:   ['item description', 'description', 'item', 'product', 'service', 'particulars', 'name'],
    hsn:           ['hsn/sac', 'hsn', 'sac', 'hsn code', 'sac code'],
    qty:           ['quantity', 'qty', 'nos', 'units', 'count'],
    unit:          ['unit', 'uom', 'unit of measure'],
    rate:          ['rate', 'price', 'unit price', 'unit rate', 'amount per unit', 'mrp'],
    discount:      ['discount%', 'discount', 'disc', 'disc%', 'discount %'],
    gstRate:       ['gst rate%', 'gst rate', 'gst%', 'gst', 'tax rate', 'tax%', 'tax rate%'],
    cgst:          ['cgst%', 'cgst', 'central gst', 'cgst rate'],
    sgst:          ['sgst%', 'sgst', 'state gst', 'sgst rate'],
    igst:          ['igst%', 'igst', 'integrated gst', 'igst rate'],
  };

  const colMap = {};
  for (const [field, aliases] of Object.entries(mappings)) {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx !== -1) { colMap[field] = idx; break; }
    }
  }
  return colMap;
}

// ── Get cell value helper ─────────────────────────────────────
function getImportCell(row, colMap, field, fallback) {
  const idx = colMap[field];
  if (idx === undefined || idx === null) return (fallback !== undefined ? fallback : '');
  const val = row[idx];
  if (val === undefined || val === null || val === '') return (fallback !== undefined ? fallback : '');
  // Handle Date objects (from cellDates:true)
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).trim();
}

// ── Group flat rows → invoice objects ─────────────────────────
function groupRowsIntoInvoices(dataRows, colMap) {
  const invoiceMap   = new Map();
  const invoiceOrder = [];
  let autoCounter    = 0;
  let prevGroupKey   = null;
  let prevClientName = null;

  dataRows.forEach((row) => {
    let groupKey = getImportCell(row, colMap, 'group');

    // If no explicit group column, create groups when client name changes
    if (!groupKey) {
      const clientName = getImportCell(row, colMap, 'clientName');
      if (clientName && clientName !== prevClientName) {
        autoCounter++;
        prevClientName = clientName;
        prevGroupKey   = `Import-${String(autoCounter).padStart(3, '0')}`;
      }
      groupKey = prevGroupKey || `Import-${String(++autoCounter).padStart(3, '0')}`;
    }

    if (!invoiceMap.has(groupKey)) {
      const invoiceDate = normalizeImportDate(getImportCell(row, colMap, 'invoiceDate'));
      const dueDate     = normalizeImportDate(getImportCell(row, colMap, 'dueDate'));
      invoiceMap.set(groupKey, {
        group:  groupKey,
        header: {
          clientName:     getImportCell(row, colMap, 'clientName'),
          clientAddress:  getImportCell(row, colMap, 'clientAddress'),
          clientGstin:    getImportCell(row, colMap, 'clientGstin'),
          clientState:    getImportCell(row, colMap, 'clientState'),
          placeOfSupply:  getImportCell(row, colMap, 'placeOfSupply'),
          invoiceDate,
          dueDate,
          paymentMode:    getImportCell(row, colMap, 'paymentMode'),
        },
        items: [],
      });
      invoiceOrder.push(groupKey);
    }

    const desc = getImportCell(row, colMap, 'description');
    if (desc) {
      // Prefer explicit CGST/SGST/IGST columns; fall back to single GST Rate%
      const hasCgstCol = colMap.cgst !== undefined;
      const hasIgstCol = colMap.igst !== undefined;
      let itemTax = {};
      if (hasCgstCol || hasIgstCol) {
        const cgst = parseFloat(getImportCell(row, colMap, 'cgst', '0')) || 0;
        const sgst = parseFloat(getImportCell(row, colMap, 'sgst', '0')) || cgst;
        const igst = parseFloat(getImportCell(row, colMap, 'igst', '0')) || 0;
        itemTax = { cgst, sgst, igst };
      } else {
        const rawGst  = parseFloat(getImportCell(row, colMap, 'gstRate', '18')) || 18;
        const gstRate = GST_RATES.reduce((prev, curr) =>
          Math.abs(curr - rawGst) < Math.abs(prev - rawGst) ? curr : prev
        );
        itemTax = { gstRate };
      }
      invoiceMap.get(groupKey).items.push({
        description: desc,
        hsn:         getImportCell(row, colMap, 'hsn'),
        qty:         getImportCell(row, colMap, 'qty'),
        unit:        getImportCell(row, colMap, 'unit'),
        rate:        getImportCell(row, colMap, 'rate'),
        discount:    getImportCell(row, colMap, 'discount', '0'),
        ...itemTax,
      });
    }
  });

  return invoiceOrder
    .map(key => invoiceMap.get(key))
    .filter(inv => inv.items.length > 0);
}

// ── Date normalizer ───────────────────────────────────────────
function normalizeImportDate(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (!str) return '';

  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2,'0')}-${String(dmy[1]).padStart(2,'0')}`;

  // MM/DD/YY (US short)
  const mdy2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdy2) {
    const year = parseInt(mdy2[3], 10) + (parseInt(mdy2[3], 10) < 50 ? 2000 : 1900);
    return `${year}-${String(mdy2[1]).padStart(2,'0')}-${String(mdy2[2]).padStart(2,'0')}`;
  }

  // Try native Date parse as last resort
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return '';
}

// ── Render import preview list ────────────────────────────────
function renderImportPreview() {
  const container = document.getElementById('import-preview');
  const count     = importedInvoices.length;

  let cards = importedInvoices.map((inv, i) => {
    const isLoaded = importLoadedSet.has(i);
    return `
    <div class="import-invoice-card${isLoaded ? ' loaded' : ''}" id="import-card-${i}">
      <div class="import-card-info">
        <div class="import-card-num">${escHtml(inv.group)}</div>
        <div class="import-card-client">${escHtml(inv.header.clientName || '—')}</div>
        <div class="import-card-meta">
          ${inv.header.invoiceDate ? fmtDisplayDate(inv.header.invoiceDate) + ' &nbsp;·&nbsp; ' : ''}
          ${inv.items.length} item${inv.items.length !== 1 ? 's' : ''}
          ${inv.header.placeOfSupply ? ' &nbsp;·&nbsp; ' + escHtml(inv.header.placeOfSupply) : ''}
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="loadImportedInvoice(${i})" ${isLoaded ? 'disabled' : ''}>
        ${isLoaded ? '✓ Loaded' : 'Load &rarr;'}
      </button>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="import-summary">
      <span class="import-count-badge">${count} invoice${count !== 1 ? 's' : ''} found</span>
      <span class="import-hint">Click Load to populate the form &nbsp;&nbsp;
        <button class="btn btn-danger btn-sm" onclick="clearImportQueue()" style="font-size:11px;padding:3px 8px;">Clear List</button>
      </span>
    </div>
    <div class="import-invoice-list">${cards}</div>`;
}

// ── Load a single imported invoice into the form ──────────────
function loadImportedInvoice(index) {
  const inv = importedInvoices[index];
  if (!inv) return;

  const currentlyHasData =
    document.getElementById('buyer-name').value.trim() ||
    document.getElementById('seller-name').value.trim();

  if (currentlyHasData && importCurrentIdx !== index) {
    if (!confirm(`Load invoice "${inv.group}"?\nUnsaved form data (buyer/items) will be replaced.`)) return;
  }

  populateFormFromImport(inv);

  // Mark as loaded and persist
  importLoadedSet.add(index);
  importCurrentIdx = index;
  saveImportQueue();

  // Highlight loaded card
  const card = document.getElementById(`import-card-${index}`);
  if (card) {
    card.classList.add('loaded');
    const btn = card.querySelector('button');
    if (btn) { btn.textContent = '✓ Loaded'; btn.disabled = true; }
  }

  closeImportModal();
  showView('form-view');
  showToast(`Invoice "${inv.group}" loaded. Fill seller details then save.`, 'success');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Fill form with imported invoice data ──────────────────────
function populateFormFromImport(inv) {
  const { header, items } = inv;

  // ---- Buyer ----
  document.getElementById('buyer-name').value            = header.clientName    || '';
  document.getElementById('buyer-billing-address').value = header.clientAddress || '';
  document.getElementById('buyer-gstin').value           = header.clientGstin   || '';

  // State matching (by name OR code)
  const matchState = (query) =>
    INDIAN_STATES.find(s =>
      s.name.toLowerCase() === (query || '').toLowerCase() ||
      s.code === (query || '').trim()
    );

  const buyerStateMatch = matchState(header.clientState);
  if (buyerStateMatch) {
    document.getElementById('buyer-state').value      = buyerStateMatch.name;
    document.getElementById('buyer-state-code').value = buyerStateMatch.code;
  }

  const posQuery = header.placeOfSupply || header.clientState;
  const posMatch = matchState(posQuery);
  if (posMatch) {
    document.getElementById('place-of-supply').value = posMatch.name;
  } else if (buyerStateMatch) {
    document.getElementById('place-of-supply').value = buyerStateMatch.name;
  }

  // ---- Invoice meta ----
  if (header.invoiceDate) document.getElementById('invoice-date').value   = header.invoiceDate;
  if (header.dueDate)     document.getElementById('due-date').value        = header.dueDate;

  if (header.paymentMode) {
    const pmSel = document.getElementById('payment-mode');
    const match = [...pmSel.options].find(o =>
      o.value.toLowerCase() === header.paymentMode.toLowerCase()
    );
    if (match) pmSel.value = match.value;
  }

  // Keep auto-generated number for new invoices
  if (!currentEditId) {
    document.getElementById('invoice-number').value =
      getNextInvoiceNumber(new Date().getFullYear(), false);
  }

  // ---- Items ----
  const tbody = document.getElementById('items-body');
  tbody.innerHTML = '';
  rowCounter = 0;
  const importTaxType = getTaxType();
  items.forEach(item => {
    if (item.cgst === undefined && item.igst === undefined && item.gstRate !== undefined) {
      const rate = parseFloat(item.gstRate) || 0;
      if (importTaxType === 'inter') {
        item = { ...item, cgst: 0, sgst: 0, igst: rate };
      } else {
        item = { ...item, cgst: rate / 2, sgst: rate / 2, igst: 0 };
      }
    }
    addRow(item);
  });

  clearErrors();
  recalculateAll();
}

// ── Download Excel template ───────────────────────────────────
function downloadExcelTemplate() {
  if (typeof XLSX === 'undefined') {
    showToast('SheetJS not loaded — cannot generate template.', 'error');
    return;
  }

  const header = [
    'Invoice Group', 'Client Name', 'Client Address', 'Client GSTIN',
    'Client State', 'Place of Supply', 'Invoice Date', 'Due Date',
    'Payment Mode', 'Item Description', 'HSN/SAC', 'Quantity',
    'Unit', 'Rate', 'Discount%', 'CGST%', 'SGST%', 'IGST%',
  ];

  const rows = [
    header,
    // Invoice 1 — intrastate (Karnataka → Karnataka), CGST+SGST @ 18%
    ['INV-001', 'Ravi Sharma', '123, MG Road, Bangalore – 560001', '29ABCDE1234F1Z5',
     'Karnataka', 'Karnataka', '2026-04-26', '2026-05-26',
     'Bank Transfer', 'Web Design Service', '998314', 1, 'Nos', 50000, 0, 9, 9, 0],
    ['INV-001', '', '', '', '', '', '', '', '',
     'SEO Consultation', '998313', 2, 'Hours', 5000, 10, 9, 9, 0],
    // Invoice 2 — interstate (Delhi → Maharashtra), IGST @ 12%
    ['INV-002', 'Priya Enterprises', '456, Ring Road, Delhi – 110001', '07XYZAB5678G2H6',
     'Delhi', 'Maharashtra', '2026-04-26', '', 'UPI',
     'Product Supply', '8471', 10, 'Nos', 2500, 5, 0, 0, 12],
    // Invoice 3 — intrastate (Maharashtra), CGST+SGST @ 18%
    ['INV-003', 'Aakash Technologies', 'B-12, MIDC, Pune – 411018', '27PQRST9876H3K7',
     'Maharashtra', 'Maharashtra', '2026-04-27', '2026-05-27',
     'Cheque', 'Annual Maintenance Contract', '998313', 1, 'Job', 36000, 0, 9, 9, 0],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    {wch:13},{wch:22},{wch:32},{wch:20},{wch:16},{wch:16},
    {wch:13},{wch:13},{wch:14},{wch:28},{wch:10},
    {wch:9},{wch:8},{wch:10},{wch:10},{wch:8},{wch:8},{wch:8},
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice Data');
  XLSX.writeFile(wb, 'gst-invoice-template.xlsx');
  showToast('Template downloaded: gst-invoice-template.xlsx', 'success');
}
