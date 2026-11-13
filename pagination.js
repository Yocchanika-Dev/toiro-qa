const PAGE_SIZE = 20;
function pageNumber(value) {
  return typeof value === 'string' && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : 1;
}
function pagination(path, query, page, hasNext, anchor = '') {
  const url = target => {
    const params = new URLSearchParams();
    for (const [key,value] of Object.entries(query)) if (typeof value === 'string' && value) params.set(key,value);
    if (target > 1) params.set('page', String(target));
    return path + (params.size ? '?' + params.toString() : '') + anchor;
  };
  return { page, previous: page > 1 ? url(page-1) : '', next: hasNext ? url(page+1) : '' };
}
module.exports = { PAGE_SIZE, pageNumber, pagination };
