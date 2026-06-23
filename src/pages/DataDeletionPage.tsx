/**
 * Public-facing Data Deletion Instructions page.
 *
 * Meta App Review verifies this URL exists.  The reviewer needs to see:
 * - A clear way for an end user (the IG user that messaged a customer) to
 *   request that their data be removed.
 * - A defined timeframe and confirmation process.
 *
 * We don't host an automated callback at this URL (Meta accepts manual
 * instructions instead) — when Meta sends a Data Deletion Request via the
 * Webhook, we process it server-side.  This page is what the user sees if
 * they navigate here directly.
 */
import { useTranslation } from "react-i18next";

const DataDeletionPage = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <article className="max-w-3xl mx-auto prose prose-slate dark:prose-invert">
        <h1>{t("dataDeletionPage.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("dataDeletionPage.lastUpdated")}
        </p>

        <h2>{t("dataDeletionPage.rightToDeletionHeading")}</h2>
        <p>
          {t("dataDeletionPage.rightToDeletionIntro1")}{" "}
          <strong>Klosify CRM</strong>
          {t("dataDeletionPage.rightToDeletionIntro2")}
        </p>
        <p>{t("dataDeletionPage.includesLabel")}</p>
        <ul>
          <li>{t("dataDeletionPage.includesInstagram")}</li>
          <li>{t("dataDeletionPage.includesWhatsApp")}</li>
          <li>{t("dataDeletionPage.includesLeads")}</li>
          <li>{t("dataDeletionPage.includesClientStored")}</li>
        </ul>

        <h2>{t("dataDeletionPage.howToRequestHeading")}</h2>

        <h3>{t("dataDeletionPage.option1Heading")}</h3>
        <p>{t("dataDeletionPage.option1Body")}</p>

        <h3>{t("dataDeletionPage.option2Heading")}</h3>
        <p>
          {t("dataDeletionPage.option2Intro")}{" "}
          <a href="mailto:hola@klosify.com" className="text-primary underline">
            hola@klosify.com
          </a>{" "}
          {t("dataDeletionPage.option2With")}
        </p>
        <ul>
          <li><strong>{t("dataDeletionPage.option2SubjectLabel")}</strong> {t("dataDeletionPage.option2SubjectValue")}</li>
          <li><strong>{t("dataDeletionPage.option2BodyLabel")}</strong> {t("dataDeletionPage.option2BodyValue")}</li>
          <li>{t("dataDeletionPage.option2Optional")}</li>
        </ul>

        <h3>{t("dataDeletionPage.option3Heading")}</h3>
        <p>{t("dataDeletionPage.option3Intro")}</p>
        <ol>
          <li>{t("dataDeletionPage.option3Step1")} <strong>{t("dataDeletionPage.option3Step1AppsSites")}</strong>{" "}
            (<a
              href="https://www.instagram.com/accounts/manage_access/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              instagram.com/accounts/manage_access
            </a>)
          </li>
          <li>{t("dataDeletionPage.option3Step2")} <strong>"CRM ADV Messages"</strong> {t("dataDeletionPage.option3Or")}
            <strong> "Klosify CRM"</strong></li>
          <li>{t("dataDeletionPage.option3Step3a")} <strong>{t("dataDeletionPage.option3Step3Remove")}</strong> {t("dataDeletionPage.option3Step3b")}</li>
        </ol>

        <h2>{t("dataDeletionPage.processingTimeHeading")}</h2>
        <p>
          {t("dataDeletionPage.processingTime1")}{" "}
          <strong>{t("dataDeletionPage.processingTime30Days")}</strong> {t("dataDeletionPage.processingTime2")}
        </p>

        <h2>{t("dataDeletionPage.whatIsDeletedHeading")}</h2>
        <ul>
          <li>{t("dataDeletionPage.deletedIdentifier")}</li>
          <li>{t("dataDeletionPage.deletedMessages")}</li>
          <li>{t("dataDeletionPage.deletedMedia")}</li>
          <li>{t("dataDeletionPage.deletedProfile")}</li>
          <li>{t("dataDeletionPage.deletedAi")}</li>
        </ul>

        <h2>{t("dataDeletionPage.exceptionsHeading")}</h2>
        <p>{t("dataDeletionPage.exceptionsBody")}</p>

        <h2>{t("dataDeletionPage.contactHeading")}</h2>
        <p>{t("dataDeletionPage.contactIntro")}</p>
        <ul>
          <li>{t("dataDeletionPage.contactEmailLabel")}{" "}
            <a href="mailto:hola@klosify.com" className="text-primary underline">
              hola@klosify.com
            </a></li>
          <li>{t("dataDeletionPage.contactResponsible")}</li>
        </ul>
      </article>
    </div>
  );
};

export default DataDeletionPage;
