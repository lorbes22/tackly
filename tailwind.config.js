/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Gabarito', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        note: '0.625rem',
      },
      colors: {
        // Chrome palette — warm paper canvas, warm ink, one periwinkle accent
        paper: {
          DEFAULT: '#FAF8F4',
          raised: '#FFFFFF',
          sunken: '#F3F0EA',
        },
        ink: {
          DEFAULT: '#26241F',
          soft: '#6E6A61',
          faint: '#A39E93',
        },
        periwinkle: {
          DEFAULT: '#6466E9',
          deep: '#5052CF',
          tint: '#EEEEFC',
        },
        line: '#E8E4DC',
        // Node palette — pastel post-it fills, kept separate from chrome.
        // Color always encodes node type, never sequence.
        note: {
          lavender: { DEFAULT: '#E6E1F8', edge: '#B9AEE8' }, // idea
          mint: { DEFAULT: '#DCEFE3', edge: '#A8D4B8' }, // fact
          pink: { DEFAULT: '#FADCEB', edge: '#E5A6C4' }, // opinion
          amber: { DEFAULT: '#FCE8C8', edge: '#EBC17F' }, // question
          sky: { DEFAULT: '#DBEAF9', edge: '#A3C6E8' }, // decision
          coral: { DEFAULT: '#F7DFDA', edge: '#E0A99F' }, // risk
          gold: { DEFAULT: '#F9EDAF', edge: '#DDC65A' }, // action
          gray: { DEFAULT: '#E9E7E2', edge: '#C3BFB6' }, // waffle — muted, recedes
          teal: { DEFAULT: '#D6EEEB', edge: '#8FC9C2' }, // topic
        },
        // shadcn/ui semantic mapping (CSS vars set in index.css)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      boxShadow: {
        // Soft chrome shadows: paper sitting on paper
        note: '0 1px 2px rgba(38, 36, 31, 0.08), 0 3px 10px rgba(38, 36, 31, 0.09)',
        'note-lg': '0 2px 4px rgba(38, 36, 31, 0.08), 0 8px 24px rgba(38, 36, 31, 0.12)',
        panel: '0 1px 3px rgba(38, 36, 31, 0.06), 0 12px 40px rgba(38, 36, 31, 0.10)',
        // Neubrutal node-card shadows: hard ink offset, no blur
        brutal: '4px 4px 0 0 #26241F',
        'brutal-sm': '2px 2px 0 0 #26241F',
        'brutal-lg': '6px 6px 0 0 #26241F',
      },
      keyframes: {
        // Snappy, bouncy scale-up — the node should feel like it jumps in
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.5) rotate(var(--note-rotation, 0deg))' },
          '55%': { opacity: '1', transform: 'scale(1.12) rotate(var(--note-rotation, 0deg))' },
          '75%': { transform: 'scale(0.96) rotate(var(--note-rotation, 0deg))' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(var(--note-rotation, 0deg))' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Transcript utterance floats up and fades once it's been processed
        'float-away': {
          '0%': { opacity: '1', transform: 'translateY(0)', maxHeight: '80px' },
          '60%': { opacity: '0', transform: 'translateY(-14px)' },
          '100%': { opacity: '0', transform: 'translateY(-14px)', maxHeight: '0px', marginBottom: '0px' },
        },
        // "Tackling" listening indicator — equalizer bars
        'eq-bar': {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
        // Forming (provisional) node — a gentle breathing pulse, distinct from
        // the steady dashed border of an open Question/Risk
        forming: {
          '0%, 100%': { opacity: '0.72' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'pop-in': 'pop-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'fade-up': 'fade-up 400ms ease-out both',
        'float-away': 'float-away 620ms ease-in forwards',
        'eq-bar': 'eq-bar 900ms ease-in-out infinite',
        forming: 'forming 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
