const text = 'PÉROLA DE OURO: No Talmud (Tratado Hagigah 12a), há uma discussão sobre a palavra "céus" (Shamayim), sugerindo que é uma combinação de ';
const sourceRegex = /(Talmud|Mishn[áa]|Midrash\s+Rabbah|Midrash|Guemer[áa]|Gemara|Fl[áa]vio\s+Josefo|Josefo|Philo\s+de\s+Alexandria|Philo|Fil[oó]n\s+de\s+Alexandria|Eus[eé]bio\s+de\s+Cesareia|Eusebio|Pais\s+da\s+Igreja|Manuscritos\s+do\s+Mar\s+Morto)\s*([\(\[][^\]\)]+[\)\]]|,\s*[^,.\n]+(?:,\s*[^,.\n]+)*)/gi;
let match;
while ((match = sourceRegex.exec(text)) !== null) {
    console.log("Match found:", match[0]);
}
