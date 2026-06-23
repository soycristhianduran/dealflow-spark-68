import { useTranslation } from "react-i18next";
import { LegalPageLayout } from "@/components/landing/LegalPageLayout";

const TermsPage = () => {
  const { t } = useTranslation();

  const sections = [
    { id: "aceptacion",    title: t("termsPage.sectionAcceptance") },
    { id: "descripcion",   title: t("termsPage.sectionDescription") },
    { id: "cuenta",        title: t("termsPage.sectionAccount") },
    { id: "uso",           title: t("termsPage.sectionAcceptableUse") },
    { id: "meta",          title: t("termsPage.sectionMeta") },
    { id: "propiedad",     title: t("termsPage.sectionIp") },
    { id: "disponibilidad",title: t("termsPage.sectionAvailabilityShort") },
    { id: "suscripcion",   title: t("termsPage.sectionSubscriptionShort") },
    { id: "responsabilidad",title: t("termsPage.sectionLiability") },
    { id: "indemnizacion", title: t("termsPage.sectionIndemnification") },
    { id: "terminacion",   title: t("termsPage.sectionTermination") },
    { id: "ley",           title: t("termsPage.sectionLawShort") },
    { id: "cambios",       title: t("termsPage.sectionChangesShort") },
    { id: "contacto",      title: t("termsPage.sectionContact") },
  ];

  return (
  <LegalPageLayout
    title={t("termsPage.pageTitle")}
    subtitle={t("termsPage.pageSubtitle")}
    lastUpdated={t("termsPage.lastUpdated")}
    sections={sections}
  >
    <h2 id="aceptacion">{t("termsPage.sectionAcceptance")}</h2>
    <p>
      {t("termsPage.acceptanceP1Pre")} <strong>Klosify CRM</strong> {t("termsPage.acceptanceP1Mid")}{" "}
      <strong>CRISTHIAN DURAN</strong>{t("termsPage.acceptanceP1Nit")}{" "}
      <strong>1094270110-2</strong>{t("termsPage.acceptanceP1Post")}
    </p>
    <p>{t("termsPage.acceptanceP2")}</p>

    <h2 id="descripcion">{t("termsPage.sectionDescription")}</h2>
    <p>{t("termsPage.descriptionIntro")}</p>
    <ul>
      <li>{t("termsPage.descriptionItem1")}</li>
      <li>{t("termsPage.descriptionItem2")}</li>
      <li>{t("termsPage.descriptionItem3")}</li>
      <li>{t("termsPage.descriptionItem4")}</li>
      <li>{t("termsPage.descriptionItem5")}</li>
    </ul>

    <h2 id="cuenta">{t("termsPage.sectionAccount")}</h2>
    <ul>
      <li>{t("termsPage.accountItem1")}</li>
      <li>{t("termsPage.accountItem2")}</li>
      <li>{t("termsPage.accountItem3")}</li>
      <li>{t("termsPage.accountItem4")}</li>
    </ul>

    <h2 id="uso">{t("termsPage.sectionAcceptableUse")}</h2>
    <p>{t("termsPage.acceptableUseIntro")}</p>
    <ul>
      <li>{t("termsPage.acceptableUseItem1")}</li>
      <li>{t("termsPage.acceptableUseItem2Pre")} <em>Messenger Platform Policy</em> {t("termsPage.acceptableUseItem2And")}{" "}
        <em>WhatsApp Business Policy</em>.</li>
      <li>{t("termsPage.acceptableUseItem3")}</li>
      <li>{t("termsPage.acceptableUseItem4")}</li>
      <li>{t("termsPage.acceptableUseItem5")}</li>
      <li>{t("termsPage.acceptableUseItem6")}</li>
      <li>{t("termsPage.acceptableUseItem7")}</li>
    </ul>
    <p>{t("termsPage.acceptableUseOutro")}</p>

    <h2 id="meta">{t("termsPage.sectionMeta")}</h2>
    <p>
      {t("termsPage.metaP1Pre")} <a href="/privacy">{t("termsPage.privacyPolicyLink")}</a> {t("termsPage.metaP1Post")}
    </p>
    <p>
      {t("termsPage.metaP2Pre")} <a href="/data-deletion">{t("termsPage.dataDeletionLink")}</a>.
    </p>

    <h2 id="propiedad">{t("termsPage.sectionIp")}</h2>
    <ul>
      <li>{t("termsPage.ipItem1")}</li>
      <li>{t("termsPage.ipItem2")}</li>
      <li>{t("termsPage.ipItem3")}</li>
    </ul>

    <h2 id="disponibilidad">{t("termsPage.sectionAvailability")}</h2>
    <p>{t("termsPage.availabilityP1")}</p>

    <h2 id="suscripcion">{t("termsPage.sectionSubscription")}</h2>
    <p>
      {t("termsPage.subscriptionPre")}{" "}
      <a href="/pricing">{t("termsPage.pricingLink")}</a> {t("termsPage.subscriptionPost")}
    </p>

    <h2 id="responsabilidad">{t("termsPage.sectionLiability")}</h2>
    <p>{t("termsPage.liabilityIntro")}</p>
    <ul>
      <li>{t("termsPage.liabilityItem1Pre")} <em>{t("termsPage.liabilityAsIs")}</em> {t("termsPage.liabilityItem1And")}{" "}
        <em>{t("termsPage.liabilityAsAvailable")}</em>{t("termsPage.liabilityItem1Post")}</li>
      <li>{t("termsPage.liabilityItem2")}</li>
      <li>{t("termsPage.liabilityItem3")}</li>
      <li>{t("termsPage.liabilityItem4")}</li>
    </ul>

    <h2 id="indemnizacion">{t("termsPage.sectionIndemnification")}</h2>
    <p>{t("termsPage.indemnificationP1")}</p>

    <h2 id="terminacion">{t("termsPage.sectionTermination")}</h2>
    <p>{t("termsPage.terminationIntro")}</p>
    <ul>
      <li>{t("termsPage.terminationItem1")}</li>
      <li>{t("termsPage.terminationItem2")}</li>
      <li>{t("termsPage.terminationItem3")}</li>
      <li>{t("termsPage.terminationItem4")}</li>
    </ul>

    <h2 id="ley">{t("termsPage.sectionLaw")}</h2>
    <p>
      {t("termsPage.lawPre")}{" "}
      <strong>{t("termsPage.lawCountry")}</strong>{t("termsPage.lawPost")}
    </p>

    <h2 id="cambios">{t("termsPage.sectionChanges")}</h2>
    <p>{t("termsPage.changesP1")}</p>

    <h2 id="contacto">{t("termsPage.sectionContact")}</h2>
    <p>{t("termsPage.contactIntro")}</p>
    <ul>
      <li>{t("termsPage.contactEmailLabel")} <a href="mailto:hola@klosify.com">hola@klosify.com</a></li>
      <li>{t("termsPage.contactResponsible")}</li>
      <li>{t("termsPage.contactAddress")}</li>
    </ul>
  </LegalPageLayout>
  );
};

export default TermsPage;
