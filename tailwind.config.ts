/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        mydark: {
          ...require('daisyui/src/theming/themes')['dark'],
          primary: '#be185d',
          secondary: '#2563eb',
          accent: '#ffffff',
          info: '#a5b4fc',
          success: '#6ee7b7',
          warning: '#facc15',
          error: '#e11d48',
        },
      },
      {
        mylight: {
          ...require('daisyui/src/theming/themes')['cupcake'],
          primary: '#be185d',
          secondary: '#2563eb',
          accent: '#000000',
          neutral: '#e0e0e0',
          info: '#a5b4fc',
          success: '#6ee7b7',
          warning: '#facc15',
          error: '#e11d48',
        },
      },
    ], // false: only light + dark | true: all themes | array: specific themes like this ["light", "dark", "cupcake"]
    darkTheme: 'mydark', // name of one of the included themes for dark mode
    base: true, // applies background color and foreground color for root element by default
    styled: true, // include daisyUI colors and design decisions for all components
    utils: true, // adds responsive and modifier utility classes
    prefix: '', // prefix for daisyUI classnames (components, modifiers and responsive class names. Not colors)
    logs: true, // Shows info about daisyUI version and used config in the console when building your CSS
    themeRoot: ':root', // The element that receives theme color CSS variables
  },
};
