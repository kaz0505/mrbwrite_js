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
        this.responseTimeout = 5000; // 5秒のタイムアウト
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
                console.log(`シリアルポート ${this.portPath} に接続しました`);
                resolve();
            });

            this.port.on('error', (err) => {
                console.error('シリアルポートエラー:', err.message);
                reject(err);
            });

            this.port.on('close', () => {
                this.isConnected = false;
                console.log('シリアルポートが閉じられました');
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
                    console.log('送信:', data.toString().trim());
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
            throw new Error(`コマンド送信失敗: ${error.message}`);
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

// 使用例
async function example() {
    console.log('=== MRBWrite 同期アクセス例 ===');
    
    try {
        // 利用可能なポートを表示
        await MRBWriteSync.listPortsSync();
        
        // シリアルポートに接続
        const mrb = new MRBWriteSync('/dev/ttyUSB0', 115200);
        await mrb.connectSync();
        
        // 単一コマンドの同期実行
        console.log('\n--- 単一コマンド実行 ---');
        const response = await mrb.sendCommandSync('AT\r\n');
        console.log('応答:', response);
        
        // 複数コマンドの同期実行
        console.log('\n--- 複数コマンド実行 ---');
        const commands = ['AT\r\n', 'ATI\r\n', 'AT+GMR\r\n'];
        const results = await mrb.executeCommandsSync(commands);
        
        results.forEach((result, index) => {
            if (result.success) {
                console.log(`${index + 1}. ${result.command.trim()} → ${result.result}`);
            } else {
                console.log(`${index + 1}. ${result.command.trim()} → エラー: ${result.error}`);
            }
        });
        
        // 切断
        await mrb.disconnectSync();
        console.log('\n接続を終了しました');
        
    } catch (error) {
        console.error('エラー:', error.message);
    }
}


async function mrbwrite_main() {
    console.log('=== MRBWrite 同期アクセスメイン関数 ===');
    
    try {
        
        // シリアルポートに接続
        const mrb = new MRBWriteSync('/dev/ttyACM0', 19200);
        await mrb.connectSync();
        
        // RBoardに接続
        do {
            const response = await mrb.sendCommandSync('\r\n');
            console.log('応答:', response);
            if ( response.startsWith('+OK mruby/c') ) break;
        } while (true);

        do {
            const response = await mrb.sendCommandSync('version\r\n');
            console.log('応答:', response);
            if ( response.includes('RITE0300') ) break;
        } while (true);

        // 切断
        await mrb.disconnectSync();
        console.log('接続を終了しました');
        
    } catch (error) {
        console.error('エラー:', error.message);
    }
}

// コマンドライン引数での実行
if (require.main === module) {
    mrbwrite_main();
}

module.exports = MRBWriteSync;
