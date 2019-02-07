import fs from 'fs';
import sourcemaps from 'rollup-plugin-sourcemaps';
import {plugins} from './build/rollup_plugins';

const version = JSON.parse(fs.readFileSync('package.json')).version;
const {BUILD, MINIFY} = process.env;
const minified = MINIFY === 'true';
const production = BUILD === 'production';
const outputFile =
    !production ? 'dist/mapbox-gl-dev.js' :
    minified ? 'dist/mapbox-gl.js' : 'dist/mapbox-gl-unminified.js';

const config = [{
    // First, use code splitting to bundle GL JS into three "chunks":
    // - rollup/build/index.js: the main module, plus all its dependencies not shared by the worker module
    // - rollup/build/worker.js: the worker module, plus all dependencies not shared by the main module
    // - rollup/build/shared.js: the set of modules that are dependencies of both the main module and the worker module
    //
    // This is also where we do all of our source transformations: removing
    // flow annotations, transpiling ES6 features using buble, inlining shader
    // sources as strings, etc.
    input: ['src/index.js', 'src/source/worker.js'],
    output: {
        dir: 'rollup/build/mapboxgl',
        format: 'amd',
        sourcemap: 'inline',
        indent: false,
        chunkFileNames: 'shared.js'
    },
    experimentalCodeSplitting: true,
    treeshake: production,
    plugins: plugins()
}, {
    // Next, bundle together the three "chunks" produced in the previous pass
    // into a single, final bundle. See rollup/bundle_prelude.js and
    // rollup/mapboxgl.js for details.
    input: 'rollup/mapboxgl.js',
    output: {
        name: 'mapboxgl',
        file: outputFile,
        format: 'umd',
        // aah: mapbox sourcemap is so big that when it's inline and we try to import mapbox
        // into a webpack project, the library webpack uses to parse inline sourcemaps,
        // source-map-loader, throw a call stack error in the regexp it uses to parse the data url.
        //
        // ERROR in ../node_modules/mapbox-gl/dist/mapbox-gl-dev.js
        // Module build failed: RangeError: Maximum call stack size exceeded
        //     at RegExp.exec (<anonymous>)
        //     at Object.module.exports (C:\Users\Adam Haile\Desktop\Mi-Co\TFS\Mi-Apps\MiAppsMobile\node_modules\source-map-loader\index.js:28:35)
        //  @ ../MiCo.MiApp.MobileClient/src/service/mapManagerMapboxUtils.ts 3:13-33
        //  @ ../MiCo.MiApp.MobileClient/src/service/mapManager.ts
        //  @ ../MiCo.MiApp.MobileClient/src/service/index.ts
        //  @ ./src/loader/editTemplate.jsx
        //  @ ./src/appRoutes.js
        //  @ ./src/appStart.jsx
        //  @ multi ../node_modules/webpack-dev-server/client?http://localhost:8082 ./src/appStart.jsx
        // webpack: Failed to compile.
        //
        // switching to external sourcemaps as a work around
        //sourcemap: production ? true : 'inline',
        sourcemap: true,
        indent: false,
        intro: fs.readFileSync(require.resolve('./rollup/bundle_prelude.js'), 'utf8'),
        banner: `/* Mapbox GL JS is licensed under the 3-Clause BSD License. Full text of license: https://github.com/mapbox/mapbox-gl-js/blob/v${version}/LICENSE.txt */`
    },
    treeshake: false,
    plugins: [
        // Ingest the sourcemaps produced in the first step of the build.
        // This is the only reason we use Rollup for this second pass
        sourcemaps()
    ],
}];

export default config
