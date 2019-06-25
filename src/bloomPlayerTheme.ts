//tslint:disable-next-line:no-submodule-imports
import { createMuiTheme } from "@material-ui/core/styles";

const bloomRed = "#d65649";
const bloomGrey = "#2e2e2e";

const theme = createMuiTheme({
    palette: {
        primary: { main: bloomGrey, contrastText: bloomRed },
        secondary: { main: bloomRed }
    }
});

export default theme;
