import { createTheme } from "@material-ui/core/styles";

export const bloomRed = "#d65649"; // also in bloom-player-ui.less
const bloomGrey = "#2e2e2e"; // also in bloom-player-ui.less
// exported color here is used in controlBar.tsx
export const bloomHighlight = "#ffff00"; // also in bloom-player-content.less

const theme = createTheme({
    palette: {
        primary: { main: bloomGrey, contrastText: bloomRed },
        secondary: { main: bloomRed }
    }
});

export default theme;
