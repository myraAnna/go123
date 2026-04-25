import random

from fastapi import APIRouter, Body

from src.models.chat import SuggestQuestionsResponse

router = APIRouter()


HARDCODED_SUGGESTIONS = [
    "Sales hari apa paling slow minggu ni?",
    "Produk atau servis mana paling laku bulan ni?",
    "Pukul berapa biasanya jualan paling tinggi?",
    "Produk atau servis mana paling kurang bergerak minggu ni?",
    "Berapa purata nilai setiap jualan hari ni?",
    "Hari weekend lebih kuat atau weekday?",
    "Ada tak pelanggan repeat bulan ni?",
    "Minggu ni naik atau turun berbanding minggu lepas?",
    "Produk atau servis mana bawa revenue paling tinggi?",
    "Jualan paling besar biasanya datang waktu bila?",
    "Ada tak hari yang nampak luar biasa lemah?",
    "Pelanggan paling kerap beli siapa?",
    "Waktu malam perform lebih baik daripada petang tak?",
    "Hari Isnin biasanya macam mana prestasinya?",
    "Revenue bulan ni setakat sekarang berapa?",
    "Produk atau servis mana paling kuat dari segi kuantiti?",
    "Bila masa paling sesuai untuk buat promosi?",
    "Ada tak pola pembelian ikut hari dalam minggu?",
    "Top 5 produk atau servis untuk bulan ni apa?",
    "Produk atau servis mana patut saya pertimbangkan untuk buang?",
    "Trend jualan saya makin baik ke tidak?",
    "Apa tindakan paling cepat untuk naikkan jualan minggu depan?",
    "Kalau saya nak fokus satu produk utama, yang mana paling sesuai?",
    "Bulan ni pelanggan unik ada berapa orang?",
    "Jualan hari ni setakat sekarang macam mana?",
    "Ada tak waktu tertentu yang consistently perlahan?",
    "Produk atau servis mana patut saya tolak lebih kuat?",
    "Perubahan paling ketara dalam jualan sejak minggu lepas apa?",
    "Nilai jualan tertinggi biasanya datang dari kategori mana?",
    "Kalau saya nak tingkatkan hasil cepat, patut mula di mana?",
]


@router.post("/chat/suggest-questions", response_model=SuggestQuestionsResponse)
def suggest_questions(_: dict | None = Body(default=None)):
    return SuggestQuestionsResponse(
        suggestedQuestions=random.sample(HARDCODED_SUGGESTIONS, k=5)
    )
