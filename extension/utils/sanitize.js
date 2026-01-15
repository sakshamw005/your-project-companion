/**
 * Safe DOM Helper - Uses existing DOMPurify to prevent unsafe innerHTML
 * Follows same pattern as dashboard.js
 */

// Use existing DOMPurify from purify.min.js
const DOMPurify = window.DOMPurify || (() => {
    console.warn('DOMPurify not loaded, using fallback');
    return {
        sanitize: (html) => {
            // Basic fallback if DOMPurify fails
            const div = document.createElement('div');
            div.textContent = html;
            return div.innerHTML;
        }
    };
})();

class SafeDOM {
    /**
     * Safely set innerHTML after sanitization
     * @param {HTMLElement} element - Target element
     * @param {string} html - HTML content
     */
    static setHTML(element, html) {
        if (!element || typeof html !== 'string') return;
        
        // Sanitize using existing DOMPurify (same as dashboard.js uses)
        const cleanHTML = DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
                'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'strong', 'em', 'b', 'i', 'u', 'br',
                'ul', 'ol', 'li',
                'a', 'table', 'tr', 'td', 'th', 'tbody', 'thead',
                'canvas', 'svg', 'path', 'img'
            ],
            ALLOWED_ATTR: [
                'class', 'id', 'style', 'width', 'height',
                'viewBox', 'd', 'fill', 'href', 'target',
                'src', 'alt', 'title'
            ]
        });
        
        element.innerHTML = cleanHTML;
    }
    
    /**
     * Create element safely (like we do in dashboard.js)
     */
    static createElement(tag, attributes = {}, text = '') {
        const el = document.createElement(tag);
        
        // Set attributes safely
        Object.entries(attributes).forEach(([key, value]) => {
            // Never allow on* attributes for security
            if (key.startsWith('on')) return;
            el.setAttribute(key, value);
        });
        
        // Use textContent for safety (like dashboard.js)
        if (text) {
            el.textContent = text;
        }
        
        return el;
    }
    
    /**
     * Create table safely (like dashboard.js modal tables)
     */
    static createTable(data, headers) {
        const table = this.createElement('table', { 
            class: 'data-table',
            style: 'width: 100%; border-collapse: collapse; margin-top: 16px;'
        });
        
        const thead = this.createElement('thead');
        const tbody = this.createElement('tbody');
        
        // Create header row
        const headerRow = this.createElement('tr');
        headers.forEach(header => {
            const th = this.createElement('th', {
                style: 'padding: 12px; text-align: left; border-bottom: 1px solid var(--border); font-weight: 600; background: rgba(255,255,255,0.05);'
            }, header);
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        
        // Create data rows
        data.forEach(rowData => {
            const tr = this.createElement('tr');
            headers.forEach(header => {
                const td = this.createElement('td', {
                    style: 'padding: 12px; border-bottom: 1px solid rgba(52, 65, 85, 0.3);'
                }, String(rowData[header] || ''));
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        
        table.appendChild(thead);
        table.appendChild(tbody);
        return table;
    }

    /**
     * Create stat card (matches dashboard.js cards)
     */
    static createStatCard(label, value, className = '') {
        const card = this.createElement('div', {
            class: `stat-card ${className}`,
            style: `
                background: rgba(30, 41, 59, 0.8);
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 16px;
                flex: 1;
                min-width: 140px;
                animation: slideUp 0.4s ease;
            `
        });

        const valueEl = this.createElement('div', {
            class: 'stat-value',
            style: 'font-size: 32px; font-weight: 700; margin-bottom: 8px; color: var(--text-primary);'
        }, String(value));

        const labelEl = this.createElement('div', {
            class: 'stat-label',
            style: 'font-size: 12px; color: var(--text-secondary); font-weight: 500;'
        }, label);

        card.appendChild(valueEl);
        card.appendChild(labelEl);
        return card;
    }
}
