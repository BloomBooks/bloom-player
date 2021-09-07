//tslint:disable-next-line:no-submodule-imports
import { createMuiTheme } from "@material-ui/core/styles";

export const bloomRed = "#d65649"; // also in bloom-player.less
const bloomGrey = "#2e2e2e"; // also in bloom-player.less
// exported color here is used in controlBar.tsx
export const bloomHighlight = "#ffff00"; // also in bloom-player.less

const theme = createMuiTheme({
    palette: {
        primary: { main: bloomGrey, contrastText: bloomRed },
        secondary: { main: bloomRed }
    }
});

export default theme;
