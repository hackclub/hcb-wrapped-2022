export default function persist () {
    document.querySelectorAll('.persist-ls').forEach(el => {
        const key = 'persist-ls-' + (el.id ?? el.getAttribute('name') ?? el.className);

        const raw = localStorage.getItem(key);
        const [value, height] = raw ? raw.split(',') : [];

        if (value) el.value = value;
        if (height) el.style.height = `${height}px`;

        const save = ({ target }) => {
            localStorage.setItem(key, `${target.value}${target.tagName == 'TEXTAREA' ? ',' + target.clientHeight : ''}`);
        }

        el.onchange = save;
        el.onkeyup = save;
        el.onmouseup = save;
    });
}