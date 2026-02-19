import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { config } from '../src/config';

dotenv.config();

async function rescue() {
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    console.log('--- WALLET RESCUE: CLEARING STUCK TRANSACTIONS ---');

    const latestNonce = await provider.getTransactionCount(wallet.address, 'latest');
    const pendingNonce = await provider.getTransactionCount(wallet.address, 'pending');

    console.log(`Billetera: ${wallet.address}`);
    console.log(`Nonce confirmado: ${latestNonce}`);
    console.log(`Nonce pendiente: ${pendingNonce}`);

    if (pendingNonce <= latestNonce) {
        console.log('✅ No hay transacciones trabadas. ¡Tu billetera está limpia!');
        return;
    }

    const numStuck = pendingNonce - latestNonce;
    console.log(`⚠️  Tienes ${numStuck} transacciones trabadas.`);

    // We will clear the EARLIEST stuck nonce (the "head" of the queue)
    const targetNonce = latestNonce;
    console.log(`🚀 Intentando destrabar el Nonce #${targetNonce} con gas alto...`);

    const feeData = await provider.getFeeData();
    // We use a very aggressive gas price to ensure it overwrites the stuck one
    const maxPriorityFee = ethers.utils.parseUnits('100', 'gwei');
    const maxFee = ethers.utils.parseUnits('800', 'gwei'); // Base fee is high (~600)

    try {
        const tx = await wallet.sendTransaction({
            to: wallet.address,
            value: 0,
            nonce: targetNonce,
            maxPriorityFeePerGas: maxPriorityFee,
            maxFeePerGas: maxFee,
            gasLimit: 21000
        });

        console.log(`✅ Transacción de rescate enviada: ${tx.hash}`);
        console.log('Esperando confirmación...');
        await tx.wait(1);
        console.log('🎉 ¡Nonce destrabado exitosamente!');
        console.log('Ahora puedes intentar el script de cobro de nuevo.');
    } catch (e: any) {
        console.error('❌ Error al intentar el rescate:', e.message);
    }
}

rescue();
