-- REVERT to OLD Stripe account: restore plan price IDs (run if switching back).

update plans set stripe_price_id_monthly="price_1TbswcRvVDvs7cXCyYdBxxwb", stripe_price_id_annual="price_1TbswdRvVDvs7cXCBJtd8JXR" where id="starter"; -- Starter
update plans set stripe_price_id_monthly="price_1TiapyRvVDvs7cXCJg58CTqA", stripe_price_id_annual="price_1TiapyRvVDvs7cXCmaNHxRjH" where id="pro"; -- Pro
update plans set stripe_price_id_monthly="price_1TiapyRvVDvs7cXCjGEUFYvH", stripe_price_id_annual="price_1TiapyRvVDvs7cXCLqmOyGZv" where id="business"; -- Business
update plans set stripe_price_id_monthly="price_1TiapzRvVDvs7cXCptmC3Zt6", stripe_price_id_annual="price_1TiapzRvVDvs7cXCaOODasPK" where id="agency"; -- Agencia
