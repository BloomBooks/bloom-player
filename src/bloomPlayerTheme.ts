//tslint:disable-next-line:no-submodule-imports
import { createMuiTheme } from "@material-ui/core/styles";

const bloomRed = "#d65649";
const bloomBlue = "#1d94a4";
const bloomPurple = "#96668f";

const theme = createMuiTheme({
    palette: {
        primary: { main: bloomRed },
        secondary: { main: bloomPurple }
    }
});

export default theme;
