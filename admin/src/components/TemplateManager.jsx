import { useEffect, useMemo, useState } from 'react';
import {
  Page,
  Card,
  IndexTable,
  Badge,
  Button,
  ButtonGroup,
  Text,
  Banner,
  Spinner,
  EmptyState,
  Tabs,
} from '@shopify/polaris';
import { adminClient } from '../api/adminClient.js';
import { TemplateForm } from './TemplateForm.jsx';

const TABS = [
  { id: 'all', content: 'All' },
  { id: 'scene', content: 'Scenes' },
  { id: 'ugc', content: 'UGC' },
  { id: 'video', content: 'Video' },
];

export function TemplateManager({ onLogout }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadTemplates = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { templates: fetched } = await adminClient.get('/templates');
      setTemplates(fetched);
    } catch (err) {
      setLoadError(err.message || 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const activeCategory = TABS[selectedTab].id;
  const visibleTemplates = useMemo(
    () => (activeCategory === 'all' ? templates : templates.filter((t) => t.category === activeCategory)),
    [templates, activeCategory],
  );

  const handleCreate = async (payload) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await adminClient.post('/templates', payload);
      setCreating(false);
      setNotice(`Created "${payload.id}".`);
      await loadTemplates();
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (payload) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await adminClient.put(`/templates/${editingTemplate.id}`, payload);
      setEditingTemplate(null);
      setNotice(`Updated "${editingTemplate.id}".`);
      await loadTemplates();
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (template) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${template.id}"? Any merchant-facing template picker will stop offering it immediately.`)) {
      return;
    }
    setDeletingId(template.id);
    try {
      await adminClient.delete(`/templates/${template.id}`);
      setNotice(`Deleted "${template.id}".`);
      await loadTemplates();
    } catch (err) {
      setLoadError(err.message || 'Failed to delete template.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Page
      title="Template catalog"
      subtitle="Shared across every merchant — changes take effect immediately for all shops."
      primaryAction={{ content: 'New template', onAction: () => setCreating(true) }}
      secondaryActions={[{ content: 'Sign out', onAction: onLogout }]}
    >
      {notice ? (
        <div style={{ marginBottom: '1rem' }}>
          <Banner tone="success" onDismiss={() => setNotice(null)}>
            <p>{notice}</p>
          </Banner>
        </div>
      ) : null}

      {loadError ? (
        <div style={{ marginBottom: '1rem' }}>
          <Banner tone="critical" title="Couldn't load templates" onDismiss={() => setLoadError(null)}>
            <p>{loadError}</p>
          </Banner>
        </div>
      ) : null}

      <Card padding="0">
        <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab} />

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Spinner accessibilityLabel="Loading templates" size="small" />
          </div>
        ) : visibleTemplates.length === 0 ? (
          <EmptyState heading="No templates in this category" image="">
            <p>Create one to get started.</p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: 'template', plural: 'templates' }}
            itemCount={visibleTemplates.length}
            headings={[
              { title: 'ID' },
              { title: 'Name' },
              { title: 'Category' },
              { title: 'Model' },
              { title: 'Cost' },
              { title: 'Prompt' },
              { title: 'Actions' },
            ]}
            selectable={false}
          >
            {visibleTemplates.map((template, index) => (
              <IndexTable.Row id={template.id} key={template.id} position={index}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="medium">
                    {template.id}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{template.name}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge>{template.category}</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>{template.preferredModel}</IndexTable.Cell>
                <IndexTable.Cell>{template.creditCost}</IndexTable.Cell>
                <IndexTable.Cell>
                  <div style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Text as="span" tone="subdued">
                      {template.promptTemplate}
                    </Text>
                  </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ButtonGroup>
                    <Button onClick={() => setEditingTemplate(template)}>Edit</Button>
                    <Button
                      tone="critical"
                      loading={deletingId === template.id}
                      onClick={() => handleDelete(template)}
                    >
                      Delete
                    </Button>
                  </ButtonGroup>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      {creating ? (
        <TemplateForm
          onSubmit={handleCreate}
          onClose={() => {
            setCreating(false);
            setFormError(null);
          }}
          submitting={submitting}
          error={formError}
        />
      ) : null}

      {editingTemplate ? (
        <TemplateForm
          template={editingTemplate}
          onSubmit={handleUpdate}
          onClose={() => {
            setEditingTemplate(null);
            setFormError(null);
          }}
          submitting={submitting}
          error={formError}
        />
      ) : null}
    </Page>
  );
}

function formatError(err) {
  if (err.details) {
    const messages = Object.values(err.details).flat();
    if (messages.length > 0) return messages.join(' ');
  }
  return err.message || 'Something went wrong.';
}
