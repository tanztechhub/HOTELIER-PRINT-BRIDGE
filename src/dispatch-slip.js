const ESC = 0x1b;
const GS = 0x1d;

function qtyText(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function center(text, cols) {
  const clean = String(text || '').trim();
  if (clean.length >= cols) return clean;
  return ' '.repeat(Math.floor((cols - clean.length) / 2)) + clean;
}

function wrap(text, cols) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + ' ' + word).length <= cols) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function line(bytes, text = '') {
  bytes.push(...Buffer.from(String(text), 'utf8'), 0x0a);
}

function bold(bytes, on) {
  bytes.push(ESC, 0x45, on ? 1 : 0);
}

function buildDispatchSlipBytes(slip, options = {}) {
  const cols = Math.max(24, Math.min(64, Number(options.columns || 42)));
  const bytes = [];
  const rule = '-'.repeat(cols);

  bytes.push(ESC, 0x40); // initialize
  bytes.push(ESC, 0x74, 0x00); // codepage

  if (options.businessName) {
    bold(bytes, true);
    line(bytes, center(String(options.businessName).toUpperCase(), cols));
    bold(bytes, false);
  }

  bold(bytes, true);
  bytes.push(GS, 0x21, 0x11);
  line(bytes, center(slip.kind === 'UPDATED_ORDER' ? 'UPDATED ORDER' : 'NEW ORDER', Math.floor(cols / 2)));
  bytes.push(GS, 0x21, 0x00);
  line(bytes, center('STORE DISPATCH REQUEST', cols));
  bold(bytes, false);
  line(bytes, rule);
  line(bytes, `Request:  ${slip.requestNo}`);
  line(bytes, `Order:    #${slip.orderNumber}${slip.table ? ` (${slip.table})` : ''}`);
  line(bytes, `For:      ${slip.to}`);
  line(bytes, `From:     ${slip.from}`);
  if (slip.waiterName || slip.requestedByName) line(bytes, `Waiter:   ${slip.waiterName || slip.requestedByName}`);
  line(bytes, `Time:     ${new Date(slip.requestedAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`);
  line(bytes, rule);

  const section = (title, dishes) => {
  if (!dishes?.length) return;
  line(bytes, rule);
  bold(bytes, true);
  line(bytes, center(title, cols));
  bold(bytes, false);
  line(bytes, rule);
  for (const dish of dishes) {
    bold(bytes, true);
    bytes.push(GS, 0x21, 0x01);
    const price = dish.totalPrice == null ? '' : `KSh ${Number(dish.totalPrice).toFixed(2)}`;
    const names = wrap(`${qtyText(dish.quantity)} x ${dish.name}`.toUpperCase(), Math.max(10, cols - price.length - 1));
    names.forEach((name, i) => line(bytes, i === 0 && price ? name.padEnd(cols - price.length) + price : name));
    bytes.push(GS, 0x21, 0x00);
    bold(bytes, false);
    for (const ing of dish.ingredients || []) {
      const amount = `${qtyText(ing.quantity)} ${ing.unit || ''}`.trim();
      const names = wrap(ing.name, Math.max(8, cols - amount.length - 1));
      names.forEach((name, i) => line(bytes, i === 0 ? name.padEnd(cols - amount.length) + amount : name));
      line(bytes, '.'.repeat(cols));
    }
  }
  };
  section('ALREADY ON ORDER', slip.existingDishes);
  section(slip.kind === 'UPDATED_ORDER' ? 'UPDATED ITEMS TO DISPATCH' : 'ITEMS TO DISPATCH', slip.dishes);

  line(bytes, rule);
  if (slip.note) {
    for (const l of wrap(slip.note, cols)) line(bytes, l);
    line(bytes, rule);
  }
  line(bytes);
  line(bytes);
  line(bytes, 'Received by:   ______________');
  line(bytes);
  line(bytes);
  line(bytes);
  line(bytes);
  bytes.push(GS, 0x56, 0x00); // full cut
  return Buffer.from(bytes);
}

module.exports = { buildDispatchSlipBytes };
