rem copy the generated outputs from where our build puts them to various places they need to be

rem bloom itself
rem it would normally get here by fetching the latest npm version of bloom-player, but we are bypassing updating bp on npm. This is the source for Bloom's build process to get it.
copy "dist\*.*" "..\BloomDesktop\src\BloomBrowserUI\node_modules\bloom-player\dist"
rem it would get here by Bloom's gulp copy task (because listed in nodeFilesNeededInOutput), but we can save a step
copy "dist\*.*" "..\BloomDesktop\output\browser\bloom-player\dist"

rem bloom-reader rn
rem where bloom-reader should get it from npm
copy "dist\*.*" "..\BloomReader-RN\node_modules\bloom-player\dist"

rem BloomReader
rem where bloom-reader should get it from npm
copy "dist\*.*" "..\BloomReader\app\node_modules\bloom-player\dist"
rem where bloom-reader's copyBloomPlayerAssets puts it for deployment
copy "dist\*.*" "..\BloomReader\app\src\main\assets\bloom-player"
