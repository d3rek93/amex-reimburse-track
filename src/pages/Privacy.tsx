import { LegalPage, LegalSection } from "@/components/LegalPage";

/**
 * Adresse de contact du responsable du traitement.
 * À renseigner une fois l'adresse validée par le propriétaire de l'application.
 */
const CONTACT_EMAIL = "";

const Privacy = () => (
  <LegalPage
    title="Politique de confidentialité"
    updatedAt="8 octobre 2026"
    intro="La présente politique décrit quelles données personnelles sont collectées par l'application « Suivi des Frais Professionnels », pourquoi elles le sont, où elles sont hébergées et quels sont vos droits. Elle s'applique à toute personne disposant d'un compte sur cette application."
  >
    <LegalSection title="1. Responsable du traitement">
      <p>
        Le traitement des données est mis en œuvre par <strong>Melvin Mons</strong>,
        utilisateur-administrateur de l'application, agissant pour les besoins du suivi de
        ses propres frais professionnels et de l'avance de frais qui lui est consentie.
      </p>
      <p>
        Pour toute question relative à vos données :{" "}
        {CONTACT_EMAIL ? (
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        ) : (
          "adresse de contact communiquée sur simple demande par l'administrateur de l'application."
        )}
      </p>
    </LegalSection>

    <LegalSection title="2. Données collectées">
      <p>Seules les données strictement nécessaires au suivi des frais sont enregistrées :</p>
      <ul>
        <li>
          <strong>Données de compte :</strong> adresse e-mail et mot de passe (stocké sous
          forme chiffrée), utilisées pour la connexion et la protection de l'accès.
        </li>
        <li>
          <strong>Dépenses :</strong> date, libellé, montant, devise, statut, source de
          paiement et, le cas échéant, catégorie, remarque ou pièce jointe que vous ajoutez.
        </li>
        <li>
          <strong>Remboursements :</strong> date, montant, statut et rapprochement avec les
          dépenses correspondantes.
        </li>
        <li>
          <strong>Éléments de compte :</strong> solde du compte professionnel et dates
          d'arrêté issus des relevés que vous importez, nécessaires au calcul de l'avance.
        </li>
        <li>
          <strong>Données de session :</strong> jeton de connexion conservé dans le
          navigateur pour maintenir la session ouverte.
        </li>
      </ul>
    </LegalSection>

    <LegalSection title="3. Finalités et base légale">
      <p>Les données sont traitées aux seules fins suivantes :</p>
      <ul>
        <li>permettre la connexion sécurisée à votre espace personnel ;</li>
        <li>enregistrer et restituer le suivi des dépenses, remboursements et avances ;</li>
        <li>calculer les soldes, écarts et totaux affichés dans les statistiques.</li>
      </ul>
      <p>
        Ces traitements reposent sur le consentement de la personne concernée et sur la
        nécessité de traiter ses propres données pour le suivi de ses frais professionnels.
      </p>
    </LegalSection>

    <LegalSection title="4. Fichiers de relevés importés">
      <p>
        Les fichiers de relevés (AMEX, Boursobank) que vous importez sont lus directement
        dans votre navigateur. Seules les lignes utiles au suivi (dates, libellés, montants)
        sont ensuite enregistrées. Le fichier original n'est pas conservé sur le serveur et
        aucune copie du relevé complet n'est constituée.
      </p>
    </LegalSection>

    <LegalSection title="5. Hébergement et localisation">
      <p>
        Les données sont hébergées sur le service d'hébergement de l'application, sur des
        infrastructures situées dans l'<strong>Union européenne</strong> (région Francfort,
        Allemagne). Le prestataire technique agit en qualité de sous-traitant, au seul
        service du responsable du traitement.
      </p>
      <p>
        Aucune donnée n'est transférée hors de l'Union européenne à des fins publicitaires,
        commerciales ou de prospection.
      </p>
    </LegalSection>

    <LegalSection title="6. Destinataires des données">
      <p>
        Vos données ne sont ni vendues, ni louées, ni échangées. Elles ne sont accessibles
        qu'à l'administrateur de l'application et au prestataire d'hébergement, dans le
        cadre strict de la maintenance technique.
      </p>
      <p>
        Aucun traceur publicitaire, réseau social ou outil de mesure d'audience tiers n'est
        déployé dans l'application. Aucun cookie de suivi n'est déposé.
      </p>
    </LegalSection>

    <LegalSection title="7. Mesures de sécurité">
      <ul>
        <li>chiffrement des échanges entre le navigateur et le serveur (HTTPS) ;</li>
        <li>mots de passe stockés sous forme chiffrée, jamais en clair ;</li>
        <li>
          cloisonnement des données : les dépenses et remboursements d'un compte ne sont pas
          consultables depuis un autre compte ;
        </li>
        <li>accès à l'application réservé aux personnes disposant d'un compte.</li>
      </ul>
    </LegalSection>

    <LegalSection title="8. Durée de conservation">
      <p>
        Les données sont conservées aussi longtemps que le compte reste actif. Elles sont
        supprimées à votre demande, ou lors de la suppression du compte, dans un délai de
        trente (30) jours. Les données nécessaires à une obligation légale ou comptable
        peuvent être conservées pour la durée légalement prévue.
      </p>
    </LegalSection>

    <LegalSection title="9. Vos droits">
      <p>
        Conformément au Règlement Général sur la Protection des Données (UE 2016/679) et à
        la loi Informatique et Libertés, vous disposez d'un droit d'
        <strong>accès</strong>, de <strong>rectification</strong>, d'
        <strong>effacement</strong>, de <strong>limitation</strong>, de{" "}
        <strong>portabilité</strong> et d'<strong>opposition</strong> au traitement de vos
        données, ainsi que du droit de définir des directives relatives à leur sort après
        votre décès.
      </p>
      <p>
        Vous pouvez exercer ces droits auprès du responsable du traitement. Si une réponse
        ne vous satisfait pas, vous pouvez introduire une réclamation auprès de la Commission
        Nationale de l'Informatique et des Libertés (CNIL), 3 place de Fontenoy – TSA 80715,
        75334 Paris Cedex 07, ou sur www.cnil.fr.
      </p>
    </LegalSection>

    <LegalSection title="10. Mise à jour de la politique">
      <p>
        La présente politique peut être adaptée à l'occasion de toute évolution de
        l'application ou de la réglementation. Sa version la plus récente est toujours
        consultable à l'adresse /privacy.
      </p>
    </LegalSection>
  </LegalPage>
);

export default Privacy;
