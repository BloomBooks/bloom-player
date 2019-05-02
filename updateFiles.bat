rem copy the generated bloomPlayer.js from where our build puts it to many places it needs to be

rem bloom itself
rem it would normally get here by fetching the latest npm version of bloom-player, but we are bypassing updating bp on npm. This is the source for Bloom's build process to get it.
copy "C:\github\bloom-player\dist\bloomPlayer.*" C:\Bloom\src\BloomBrowserUI\node_modules\bloom-player\dist
rem it would get here by Bloom's gulp copy task (because listed in nodeFilesNeededInOutput), but we can save a step
copy "C:\github\bloom-player\dist\bloomPlayer.*" C:\Bloom\output\browser\bloom-player\dist

rem bloom-reader rn
rem where bloom-reader should get it from npm
copy "C:\github\bloom-player\dist\bloomPlayer.*" C:\github\BloomReader-RN\node_modules\bloom-player\dist