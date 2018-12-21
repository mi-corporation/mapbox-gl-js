// @flow

import pako from 'pako/lib/inflate';
import base64js from 'base64-js';

import window from '../util/window';
import { Evented } from '../util/evented';
import VectorTileSource from './vector_tile_source';

import type Dispatcher from '../util/dispatcher';
import type Tile from './tile';
import type {Callback} from '../types/callback';
import type {VectorSourceSpecification} from '../style-spec/types';

class MBTilesSource extends VectorTileSource {
    db: Promise<any>;

    constructor(id: string, options: VectorSourceSpecification & {collectResourceTiming: boolean, path: string}, dispatcher: Dispatcher, eventedParent: Evented) {
        super(id, options, dispatcher, eventedParent);
        this.type = "mbtiles";
        this.db = this.openDatabase(options.path);
    }

    openDatabase(dbLocation: string) {
        if ('sqlitePlugin' in window) {
            return new Promise<any>((resolve, reject) => {
                try {
                    window.sqlitePlugin.openDatabase({ name: dbLocation, iosDatabaseLocation: 'Documents' }, resolve, reject);
                } catch (e) {
                    reject(e);
                }
            });
        } else {
            return Promise.reject(new Error("cordova-sqlite-ext plugin not available. " +
                "Please install the plugin and make sure this code is run after onDeviceReady event"));
        }
    }

    readTile(z: number, x: number, y: number, callback: Callback<string>) {
        const query = 'SELECT BASE64(tile_data) AS base64_tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?';
        const params = [z, x, y];
        this.db.then(db => {
            db.transaction(txn => {
                txn.executeSql(query, params, (tx, res) => {
                    if (res.rows.length) {
                        const base64Data = res.rows.item(0).base64_tile_data;
                        const rawData = pako.inflate(base64js.toByteArray(base64Data));
                        callback(undefined, base64js.fromByteArray(rawData)); // Tile contents read, callback success.
                    } else {
                        callback(new Error(`tile ${params.join(',')} not found`));
                    }
                });
            }, error => {
                callback(error); // Error executing SQL
            });
        }).catch(err => {
            callback(err);
        });
    }

    loadTile(tile: Tile, callback: Callback<void>) {
        const coord = tile.tileID.canonical;
        const overscaling = coord.z > this.maxzoom ? Math.pow(2, coord.z - this.maxzoom) : 1;

        const z = Math.min(coord.z, this.maxzoom || coord.z); // Don't try to get data over maxzoom
        const x = coord.x;
        const y = Math.pow(2, z) - coord.y - 1; // Tiles on database are tms (inverted y axis)

        this.readTile(z, x, y, dispatch.bind(this));

        function dispatch(err, base64Data) {
            if (err) {
                return callback(err);
            }

            if (base64Data === undefined || base64Data === null) {
                return callback(new Error("empty data"));
            }

            const params = {
                request: { url: `data:application/x-protobuf;base64,${base64Data}` },
                uid: tile.uid,
                tileID: tile.tileID,
                zoom: coord.z,
                tileSize: this.tileSize * overscaling,
                type: this.type,
                source: this.id,
                pixelRatio: window.devicePixelRatio || 1,
                overscaling,
                showCollisionBoxes: this.map.showCollisionBoxes
            };

            if (tile.workerID === undefined || tile.state === 'expired') {
                tile.workerID = this.dispatcher.send('loadTile', params, done.bind(this));
            } else if (tile.state === 'loading') {
                // schedule tile reloading after it has been loaded
                tile.reloadCallback = callback;
            } else {
                this.dispatcher.send('reloadTile', params, done.bind(this), tile.workerID);
            }

            function done(err, data) {
                if (tile.aborted)
                    return callback(null);

                if (err) {
                    return callback(err);
                }

                if (this.map._refreshExpiredTiles && data) tile.setExpiryData(data);
                tile.loadVectorData(data, this.map.painter);

                callback(null);

                if (tile.reloadCallback) {
                    this.loadTile(tile, tile.reloadCallback);
                    tile.reloadCallback = null;
                }
            }
        }
    }
}

export default MBTilesSource;
