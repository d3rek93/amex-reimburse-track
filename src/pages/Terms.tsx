import { Link } from "react-router-dom";
import { LegalPage, LegalSection } from "@/components/LegalPage";

const Terms = () => (
  <LegalPage
    title="Conditions d'utilisation"
    updatedAt="8 octobre 2026"
    intro="Les présentes conditions régissent l'accès et l'utilisation de l'application « Suivi des Frais Professionnels ». Toute création de compte ou utilisation de l'application implique l'acceptation de ces conditions."
  >
    <LegalSection title="1. Objet du service">
      <p>
        L'application est un outil personnel de suivi des frais professionnels. Elle permet
        d'importer et de classer les dépenses issues de relevés bancaires et de carte, de
        rapprocher les remboursements perçus, de signaler les écarts et de suivre le montant
        de l'avance de frais consentie.
      </p>
      <p>
        Elle ne constitue ni un logiciel de comptabilité, ni un service de paiement, ni un
        outil de déclaration fiscale.
      </p>
    </LegalSection>

    <LegalSection title="2. Accès et compte">
      <ul>
        <li>
          L'accès est réservé aux personnes disposant d'un compte créé avec une adresse
          e-mail et un mot de passe.
        </li>
        <li>
          Le titulaire du compte est responsable de la confidentialité de ses identifiants
          et de toute utilisation effectuée depuis son compte.
        </li>
        <li>
          L'administrateur peut refuser, suspendre ou supprimer un accès, notamment en cas
          d'usage non conforme aux présentes conditions.
        </li>
      </ul>
    </LegalSection>

    <LegalSection title="3. Responsabilités de l'utilisateur">
      <ul>
        <li>
          Vous êtes seul responsable des fichiers de relevés et des dépenses que vous
          saisissez ou importez, ainsi que de leur exactitude et de leur licéité.
        </li>
        <li>
          Vous ne devez importer que des relevés dont vous êtes titulaire ou pour lesquels
          vous disposez d'une autorisation.
        </li>
        <li>
          Vous vous engagez à ne pas utiliser l'application à des fins illégales, frauduleuses
          ou portant atteinte aux droits de tiers.
        </li>
      </ul>
    </LegalSection>

    <LegalSection title="4. Nature des calculs">
      <p>
        Les montants affichés — totaux, statistiques, écarts et solde de l'avance — sont
        calculés à partir des seules données enregistrées dans l'application. Ils sont fournis
        à titre indicatif et ne se substituent ni aux relevés officiels de votre banque ou de
        votre émetteur de carte, ni aux documents comptables ou fiscaux de votre employeur.
      </p>
      <p>
        En cas de divergence, les relevés bancaires et les justificatifs de remboursement
        font seuls foi. Il vous appartient de vérifier les montants et de corriger, le cas
        échéant, les lignes saisies ou importées.
      </p>
    </LegalSection>

    <LegalSection title="5. Disponibilité et évolutions">
      <p>
        L'application est fournie en l'état. Son accès peut être interrompu, suspendu ou
        modifié sans préavis, pour des raisons techniques, de maintenance ou d'évolution du
        service. Aucune obligation de résultat ou de continuité de service n'est souscrite.
      </p>
      <p>
        Les fonctionnalités, les formats de fichiers pris en charge et les règles de calcul
        peuvent évoluer afin de s'adapter aux formats communiqués par les établissements
        bancaires.
      </p>
    </LegalSection>

    <LegalSection title="6. Données personnelles">
      <p>
        Le traitement des données personnelles nécessaires au fonctionnement du service est
        décrit dans la{" "}
        <Link to="/privacy" className="text-primary underline underline-offset-4">
          politique de confidentialité
        </Link>
        . L'utilisateur s'engage à ne pas inscrire de données concernant des tiers dans
        l'application.
      </p>
    </LegalSection>

    <LegalSection title="7. Propriété intellectuelle">
      <p>
        L'interface, la structure et les développements de l'application sont la propriété du
        responsable du service. Les données que vous y saisissez vous appartiennent.
      </p>
    </LegalSection>

    <LegalSection title="8. Résiliation et suppression">
      <p>
        L'utilisation peut être interrompue à tout moment par simple déconnexion. La
        suppression définitive du compte et des données associées peut être demandée à tout
        moment auprès de l'administrateur ; elle est effective dans un délai de trente (30)
        jours.
      </p>
    </LegalSection>

    <LegalSection title="9. Limitation de responsabilité">
      <p>
        Le responsable du service ne saurait être tenu responsable des erreurs, omissions ou
        pertes de données résultant d'une saisie incorrecte, d'un format de relevé non prévu,
        d'une interruption d'accès ou d'un cas de force majeure, ni des décisions prises sur
        la seule base des montants affichés.
      </p>
    </LegalSection>

    <LegalSection title="10. Droit applicable">
      <p>
        Les présentes conditions sont soumises au droit français. À défaut d'accord amiable,
        tout litige relève des juridictions françaises compétentes.
      </p>
    </LegalSection>
  </LegalPage>
);

export default Terms;
