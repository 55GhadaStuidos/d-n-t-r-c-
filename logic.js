function generateBorteID(nickname) {
    const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 haneli sayı
    return `${nickname}#${randomDigits}`;
}

// Örnek kullanım:
// let myID = generateBorteID("Elliot"); 
// console.log(myID); // Çıktı: Elliot#7412
