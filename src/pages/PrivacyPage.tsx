import { LegalPageLayout } from "@/components/landing/LegalPageLayout";
import { useTranslation } from "react-i18next";

const PrivacyPage = () => {
  const { t } = useTranslation();

  const sections = [
    { id: "responsable",   title: t("privacyPage.section1Title") },
    { id: "datos",         title: t("privacyPage.section2Title") },
    { id: "uso",           title: t("privacyPage.section3Title") },
    { id: "terceros",      title: t("privacyPage.section4Title") },
    { id: "retencion",     title: t("privacyPage.section5Title") },
    { id: "derechos",      title: t("privacyPage.section6Title") },
    { id: "seguridad",     title: t("privacyPage.section7Title") },
    { id: "cookies",       title: t("privacyPage.section8Title") },
    { id: "menores",       title: t("privacyPage.section9Title") },
    { id: "cambios",       title: t("privacyPage.section10Title") },
    { id: "contacto",      title: t("privacyPage.section11Title") },
  ];

  return (
    <LegalPageLayout
      title={t("privacyPage.pageTitle")}
      subtitle={t("privacyPage.pageSubtitle")}
      lastUpdated={t("privacyPage.lastUpdated")}
      sections={sections}
    >
      <h2 id="responsable">{t("privacyPage.section1Heading")}</h2>
      <p>
        <strong>CRISTHIAN DURAN</strong> {t("privacyPage.controllerIntro")}
        <strong>NIT 1094270110-2</strong>{t("privacyPage.controllerDomicile")}<code>klosify.com</code> {t("privacyPage.controllerDomicileEnd")}
      </p>
      <p>{t("privacyPage.controllerScope")}</p>

      <h2 id="datos">{t("privacyPage.section2Heading")}</h2>
      <h3>{t("privacyPage.subsection21Heading")}</h3>
      <ul>
        <li>{t("privacyPage.data21Item1")}</li>
        <li>{t("privacyPage.data21Item2")}</li>
        <li>{t("privacyPage.data21Item3")}</li>
        <li>{t("privacyPage.data21Item4")}</li>
      </ul>

      <h3>{t("privacyPage.subsection22Heading")}</h3>
      <p>{t("privacyPage.data22Intro")}</p>
      <ul>
        <li><strong>{t("privacyPage.data22Item1Label")}</strong> {t("privacyPage.data22Item1Text")}{" "}
          <code>instagram_business_manage_messages</code>.</li>
        <li><strong>{t("privacyPage.data22Item2Label")}</strong> {t("privacyPage.data22Item2Text")}{" "}
          <code>instagram_manage_comments</code>.</li>
        <li><strong>{t("privacyPage.data22Item3Label")}</strong> {t("privacyPage.data22Item3Text")}{" "}
          <code>instagram_business_basic</code>.</li>
        <li><strong>{t("privacyPage.data22Item4Label")}</strong> {t("privacyPage.data22Item4Text")}</li>
        <li><strong>{t("privacyPage.data22Item5Label")}</strong> {t("privacyPage.data22Item5Text")}</li>
        <li><strong>{t("privacyPage.data22Item6Label")}</strong> {t("privacyPage.data22Item6Text")}</li>
      </ul>

      <h2 id="uso">{t("privacyPage.section3Heading")}</h2>
      <p>{t("privacyPage.useIntro")}</p>
      <ul>
        <li>{t("privacyPage.useItem1")}</li>
        <li>{t("privacyPage.useItem2")}</li>
        <li>{t("privacyPage.useItem3")}</li>
        <li>{t("privacyPage.useItem4")}{" "}
          <strong>{t("privacyPage.useItem4Strong")}</strong></li>
        <li>{t("privacyPage.useItem5")}</li>
      </ul>
      <p>
        <strong>{t("privacyPage.useNoSellStrong")}</strong> {t("privacyPage.useNoSellText")}
      </p>

      <h2 id="terceros">{t("privacyPage.section4Heading")}</h2>
      <p>{t("privacyPage.thirdPartiesIntro")}</p>
      <ul>
        <li><strong>Supabase Inc.</strong> {t("privacyPage.thirdPartiesSupabase")}</li>
        <li><strong>Vercel Inc.</strong> {t("privacyPage.thirdPartiesVercel")}</li>
        <li><strong>OpenAI, L.L.C.</strong> {t("privacyPage.thirdPartiesOpenAIPre")}<em>API</em>{t("privacyPage.thirdPartiesOpenAIPost")}</li>
        <li><strong>Meta Platforms, Inc.</strong> {t("privacyPage.thirdPartiesMeta")}</li>
      </ul>
      <p>{t("privacyPage.thirdPartiesOutro")}</p>

      <h2 id="retencion">{t("privacyPage.section5Heading")}</h2>
      <ul>
        <li>{t("privacyPage.retentionItem1")}</li>
        <li>{t("privacyPage.retentionItem2")}</li>
        <li>{t("privacyPage.retentionItem3Pre")}<strong>{t("privacyPage.retentionItem3Days")}</strong>{t("privacyPage.retentionItem3Post")}</li>
        <li>{t("privacyPage.retentionItem4")}</li>
      </ul>

      <h2 id="derechos">{t("privacyPage.section6Heading")}</h2>
      <p>{t("privacyPage.rightsIntro")}</p>
      <ul>
        <li>{t("privacyPage.rightsItem1")}</li>
        <li>{t("privacyPage.rightsItem2")}</li>
        <li>{t("privacyPage.rightsItem3Pre")}{" "}
          <a href="/data-deletion">{t("privacyPage.rightsItem3Link")}</a>{t("privacyPage.rightsItem3Post")}</li>
        <li>{t("privacyPage.rightsItem4")}</li>
        <li>{t("privacyPage.rightsItem5")}</li>
      </ul>
      <p>
        {t("privacyPage.rightsContactPre")}{" "}
        <a href="mailto:hola@klosify.com">hola@klosify.com</a>. {t("privacyPage.rightsContactPost")}<strong>{t("privacyPage.rightsContactDays")}</strong>.
      </p>

      <h2 id="seguridad">{t("privacyPage.section7Heading")}</h2>
      <p>{t("privacyPage.securityIntro")}</p>
      <ul>
        <li>{t("privacyPage.securityItem1")}</li>
        <li>{t("privacyPage.securityItem2")}</li>
        <li>{t("privacyPage.securityItem3")}</li>
        <li>{t("privacyPage.securityItem4")}</li>
      </ul>

      <h2 id="cookies">{t("privacyPage.section8Heading")}</h2>
      <p>{t("privacyPage.cookiesText")}</p>

      <h2 id="menores">{t("privacyPage.section9Heading")}</h2>
      <p>{t("privacyPage.minorsText")}</p>

      <h2 id="cambios">{t("privacyPage.section10Heading")}</h2>
      <p>{t("privacyPage.changesText")}</p>

      <h2 id="contacto">{t("privacyPage.section11Heading")}</h2>
      <ul>
        <li>{t("privacyPage.contactEmailLabel")} <a href="mailto:hola@klosify.com">hola@klosify.com</a></li>
        <li>{t("privacyPage.contactController")}</li>
        <li>{t("privacyPage.contactDomicile")}</li>
      </ul>
    </LegalPageLayout>
  );
};

export default PrivacyPage;
