class ColorConverter {
    static hexToRgb(hex) {
        const bigint = parseInt(hex.substring(1), 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        };
    }

    static rgbToHsl({r, g, b}) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h,
            s,
            l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }

            h /= 6;
        }

        return {h, s, l};
    }

    static hslToRgb(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return {r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255)};
    }

    static rgbToHex({r, g, b}) {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    static createColorForShade(hex, shade) {
        const luminanceToLevel = {
            100: 0.95,
            200: 0.85,
            300: 0.75,
            400: 0.6,
            500: 0.5,
            600: 0.4,
            700: 0.3,
            800: 0.2,
            900: 0.1,
        };

        const rgb = this.hexToRgb(hex);
        const hsl = this.rgbToHsl(rgb);
        const targetLuminance = luminanceToLevel[shade];

        const threshold = 0.05;

        if (Math.abs(hsl.l - targetLuminance) < threshold) {
            return hex;
        }

        const newRgb = this.hslToRgb(hsl.h, hsl.s, targetLuminance);
        return this.rgbToHex(newRgb);
    }
}

module.exports = ColorConverter;
