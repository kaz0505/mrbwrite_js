const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class MRBWriteSync {
    constructor(portPath, baudRate = 115200, options = {}) {
        this.portPath = portPath;
        this.baudRate = baudRate;
        this.options = {
            autoOpen: false,
            ...options
        };
        this.port = null;
        this.parser = null;
        this.isConnected = false;
        this.responseTimeout = 1000; // 1秒のタイムアウト
    }

    // 同期的に接続
    connectSync() {
        return new Promise((resolve, reject) => {
            this.port = new SerialPort({
                path: this.portPath,
                baudRate: this.baudRate,
                ...this.options
            });

            this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

            this.port.on('open', () => {
                this.isConnected = true;
                resolve();
            });

            this.port.on('error', (err) => {
                console.error('シリアルポートエラー:', err.message);
                reject(err);
            });

            this.port.on('close', () => {
                this.isConnected = false;
            });

            this.port.open();
        });
    }

    // 同期的にデータを送信
    writeSync(data) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('シリアルポートが接続されていません'));
                return;
            }

            this.port.write(data, (err) => {
                if (err) {
                    console.error('書き込みエラー:', err.message);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // 同期的にデータを読み取り（タイムアウト付き）
    readSync(timeout = this.responseTimeout) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('シリアルポートが接続されていません'));
                return;
            }

            const timeoutId = setTimeout(() => {
                reject(new Error('読み取りタイムアウト'));
            }, timeout);

            const onData = (data) => {
                clearTimeout(timeoutId);
                this.parser.removeListener('data', onData);
                resolve(data.toString().trim());
            };

            this.parser.once('data', onData);
        });
    }

    // 同期的にコマンドを送信して応答を待つ
    async sendCommandSync(command, timeout = this.responseTimeout) {
        try {
            await this.writeSync(command);
            const response = await this.readSync(timeout);
            return response;
        } catch (error) {
            return "";
        }
    }

    // 複数のコマンドを順番に同期実行
    async executeCommandsSync(commands, delay = 100) {
        const results = [];
        
        for (const command of commands) {
            try {
                const result = await this.sendCommandSync(command);
                results.push({ command, result, success: true });
                
                // コマンド間に少し待機
                if (delay > 0) {
                    await this.sleep(delay);
                }
            } catch (error) {
                results.push({ command, error: error.message, success: false });
            }
        }
        
        return results;
    }

    // 同期的に切断
    disconnectSync() {
        return new Promise((resolve) => {
            if (this.port && this.port.isOpen) {
                this.port.close(() => {
                    this.isConnected = false;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    // ユーティリティ: スリープ
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 利用可能なポートを同期的に取得
    static async listPortsSync() {
        try {
            const ports = await SerialPort.list();
            console.log('利用可能なシリアルポート:');
            ports.forEach((port, index) => {
                console.log(`  ${index + 1}. ${port.path} - ${port.manufacturer || 'Unknown'}`);
            });
            return ports;
        } catch (error) {
            console.error('ポート一覧取得エラー:', error.message);
            throw error;
        }
    }

    // 接続状態を確認
    isConnectedSync() {
        return this.isConnected && this.port && this.port.isOpen;
    }

    // ポート情報を取得
    getPortInfo() {
        return {
            path: this.portPath,
            baudRate: this.baudRate,
            isConnected: this.isConnectedSync(),
            options: this.options
        };
    }
}

// メイン関数
// 引数でファイル名を受け取り、mrbバイトコードを送信、実行する
async function mrbwrite_main( bytecode, port = '/dev/ttyUSB0', baudRate = 19200 ) {
    try {
        
        // シリアルポートに接続
        const mrb = new MRBWriteSync(port, baudRate);
        await mrb.connectSync();
        
        // RBoardに接続
        do {
            const response = await mrb.sendCommandSync('\n');
//            console.log('RBoard接続応答:', response);
            if( ( await mrb.readSync(5000)).startsWith('+OK mruby/c') ) break;
        } while (true);

        // バージョン確認
        let  response = await mrb.sendCommandSync('version\r\n');
//        console.log('バージョン確認:', response);
        
        // バイトコード送信
        response = await mrb.sendCommandSync("write " + bytecode.length + "\r\n");
//        console.log('witeコマンド:', response);
        await mrb.writeSync(bytecode);
        response = await mrb.readSync(1000);
//        console.log('バイトコード送信完了:', response);

        response2 = await mrb.sendCommandSync('version\r\n');
//        console.log('バージョン確認:', response2);

        // 実行
        const runResponse = await mrb.sendCommandSync('execute\r\n');
//        console.log('実行結果:', runResponse);
    
        // 切断
        await mrb.disconnectSync();
//        console.log('接続を終了しました');
        
    } catch (error) {
        console.error('エラー:', error.message);
    }
}

// コマンドライン引数での実行
if (require.main === module) {
//    console.log('引数:', process.argv.slice(2));
    if (process.argv.length < 3) {
        console.error('使用法: node mrbwrite.js [.rb / .mrb] [-p ポート] [-b ボーレート]');
        process.exit(1);
    }

    // コマンドライン引数
    let port = '/dev/ttyUSB0';
    let baudRate = 19200;
    let files = [];
    for (let i = 2; i < process.argv.length; i++) {
        if( process.argv[i].startsWith('-p') ){
            i++;
            port = process.argv[i];
            continue;
        } else if( process.argv[i].startsWith('-b') ){
            i++;
            baudRate = parseInt(process.argv[i], 10);
            continue;
        }
        files.push(process.argv[i]);
    }

    if (files.length === 0) {   
        console.error('少なくとも1つのファイルを指定してください');
        process.exit(1);
    }

    let bytecodes = [];
    // コンパイルしてバイトコードを生成
    for (const file of files) {
        // バイトコードかどうかを判定する
        // ファイルの先頭文字が 'RITE' かどうかを確認
        const fs = require('fs');
        const data = fs.readFileSync(file);
        if (data.length >= 4 && data.toString('utf8', 0, 4) === 'RITE') {
            // バイトコードとして扱う
            bytecodes.push(data);
        } else {
        }
    }

    // バイトコードが複数の場合、結合する
    if (bytecodes.length > 1) {
        const combined = Buffer.concat(bytecodes);
        bytecodes = [combined];
    }

    // メイン関数を実行
    mrbwrite_main(bytecodes[0], port, baudRate);
}

module.exports = MRBWriteSync;
