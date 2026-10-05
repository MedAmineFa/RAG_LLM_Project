// theme.js
import { extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
    fonts: {
        heading: "'Roboto', sans-serif",
        body: "'Roboto', sans-serif",
    },
    colors: {
        primary: {
            50: "#e4f6fb",
            100: "#bde7f2",
            200: "#93d7e8",
            300: "#69c8df",
            400: "#3fb8d5",
            500: "#55B2C9",
            600: "#3791a4",
            700: "#2b6e7d",
            800: "#1f4a55",
            900: "#12272e",
        },
        secondary: {
            50: "#e5eaf3",
            100: "#c3cde0",
            200: "#9fb0cd",
            300: "#7b93ba",
            400: "#5776a7",
            500: "#335a94",
            600: "#284776",
            700: "#1e3559",
            800: "#14233b",
            900: "#0a111e",
        },
    },
    components: {
        Table: {
            baseStyle: {
                fontFamily: "'Roboto', sans-serif",
            },
        },
    },
});

export default theme;
